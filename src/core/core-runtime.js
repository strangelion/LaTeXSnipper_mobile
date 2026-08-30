// LaTeXSnipper Core 3 adapter.
//
// Android keeps using the production Java/ONNX recognizer for inference. This
// adapter owns the shared Core contract after recognition: capability/version
// negotiation, Document AST construction, and semantic conversion. The WASM
// module is loaded lazily so startup and camera capture remain responsive.

const CORE_DOCUMENT_SCHEMA = '1.0.0';
const CORE_API_ENVELOPE = 3;

let runtimePromise = null;
let runtimeStatus = {
  state: 'idle',
  available: false,
  coreVersion: null,
  documentSchemaVersion: null,
  error: null,
};

export function getCoreRuntimeStatus() {
  return { ...runtimeStatus };
}

/**
 * Initialize the pinned Core WASM package.
 * @param {{ wasmInput?: BufferSource|WebAssembly.Module }} [options]
 */
export function initCoreRuntime(options = {}) {
  if (runtimePromise) return runtimePromise;
  runtimeStatus = { ...runtimeStatus, state: 'loading', error: null };

  runtimePromise = import('latexsnipper-wasm')
    .then(async (core) => {
      const initArg = options.wasmInput
        ? { module_or_path: options.wasmInput }
        : undefined;
      await core.default(initArg);
      core.init();

      const info = core.api_info_v3();
      validateApiInfo(info);
      const capabilities = core.capabilities_v3();
      if (!capabilities?.ok) {
        throw new Error(capabilities?.error?.message || 'Core capability negotiation failed');
      }

      runtimeStatus = {
        state: 'ready',
        available: true,
        coreVersion: info.versions.coreVersion,
        documentSchemaVersion: info.versions.documentSchemaVersion,
        error: null,
      };
      if (typeof window !== 'undefined') {
        window.__latexsnipperCoreStatus = getCoreRuntimeStatus();
        window.dispatchEvent(new CustomEvent('latexsnippercorechange', {
          detail: getCoreRuntimeStatus(),
        }));
      }
      return { core, info, capabilities };
    })
    .catch((error) => {
      runtimeStatus = {
        state: 'failed',
        available: false,
        coreVersion: null,
        documentSchemaVersion: null,
        error: error instanceof Error ? error.message : String(error),
      };
      runtimePromise = null;
      if (typeof window !== 'undefined') {
        window.__latexsnipperCoreStatus = getCoreRuntimeStatus();
      }
      throw error;
    });

  return runtimePromise;
}

function validateApiInfo(info) {
  if (!info?.ok) {
    throw new Error(info?.error?.message || 'Core v3 API is unavailable');
  }
  const versions = info.versions || {};
  if (versions.apiEnvelopeVersion !== CORE_API_ENVELOPE) {
    throw new Error(`Unsupported Core API envelope ${versions.apiEnvelopeVersion}`);
  }
  if (versions.documentSchemaVersion !== CORE_DOCUMENT_SCHEMA) {
    throw new Error(`Unsupported Core document schema ${versions.documentSchemaVersion}`);
  }
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function coreGeometry(geometry) {
  if (!geometry) return undefined;
  const width = finiteNumber(geometry.width ?? geometry.w);
  const height = finiteNumber(geometry.height ?? geometry.h);
  return {
    x: finiteNumber(geometry.x),
    y: finiteNumber(geometry.y),
    width,
    height,
  };
}

function textInline(text) {
  return { type: 'Text', text: String(text ?? '') };
}

function formulaValue(block) {
  return {
    source: { format: 'Latex', content: String(block.content ?? '') },
    display_mode: block.mathStyle !== 'inline',
    confidence: finiteNumber(block.confidence),
  };
}

function blockToCore(block) {
  const geometry = coreGeometry(block.geometry);
  if (block.type === 'formula') {
    return {
      type: 'Formula',
      formula: formulaValue(block),
      ...(geometry ? { geometry } : {}),
    };
  }

  // Mobile table/image blocks are not yet rich enough to satisfy the complete
  // Core table/media schema. Preserve their user-visible text as a paragraph
  // instead of inventing unsupported structure.
  return {
    type: 'Paragraph',
    inlines: [textInline(block.content)],
    ...(geometry ? { geometry } : {}),
  };
}

/** Convert the Mobile OcrResult into the canonical Core 3 Document AST. */
export function buildCoreDocument(result, context = {}) {
  const blocks = Array.isArray(result?.blocks) ? result.blocks : [];
  const pageWidth = finiteNumber(context.width ?? result?.meta?.width);
  const pageHeight = finiteNumber(context.height ?? result?.meta?.height);
  const timeMs = finiteNumber(result?.meta?.timeMs, 0);

  return {
    metadata: {
      language: context.language || null,
      created_at: new Date().toISOString(),
      ocr_model: result?.meta?.model || context.model || 'mobile-native-onnx',
      ocr_version: context.pipelineVersion || null,
      ocr_time_ms: timeMs || null,
    },
    pages: [{
      width: pageWidth,
      height: pageHeight,
      blocks: blocks.map(blockToCore),
      page_number: 1,
    }],
    assets: [],
    diagnostics: [],
    schema_version: CORE_DOCUMENT_SCHEMA,
    notes: [],
  };
}

function coreFailure(error) {
  return {
    available: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

/**
 * Attach a Core-validated Document AST to a Mobile recognition result.
 * Recognition still succeeds if Core cannot initialize; the failure is
 * explicit in result.meta.core and the Java inference output is preserved.
 */
export async function attachCoreDocument(result, context = {}) {
  if (!result || result.error) return result;
  const document = buildCoreDocument(result, context);
  try {
    const { core, info } = await initCoreRuntime(context.coreOptions || {});
    const validation = core.convert_v3(JSON.stringify(document), 'latex');
    if (!validation?.ok) {
      throw new Error(validation?.error?.message || 'Core rejected the recognition document');
    }
    return {
      ...result,
      document,
      meta: {
        ...(result.meta || {}),
        core: {
          available: true,
          coreVersion: info.versions.coreVersion,
          apiEnvelopeVersion: info.versions.apiEnvelopeVersion,
          documentSchemaVersion: info.versions.documentSchemaVersion,
          diagnostics: validation.diagnostics || validation.data?.diagnostics || [],
        },
      },
    };
  } catch (error) {
    return {
      ...result,
      document,
      meta: { ...(result.meta || {}), core: coreFailure(error) },
    };
  }
}

function requireSuccessfulArtifact(response) {
  if (!response?.ok || !response.data) {
    throw new Error(response?.error?.message || 'Core conversion failed');
  }
  return response.data;
}

export async function convertCoreDocument(document, format) {
  const { core } = await initCoreRuntime();
  return requireSuccessfulArtifact(core.convert_v3(JSON.stringify(document), format));
}

export async function convertOcrResult(result, format, context = {}) {
  const document = result?.document || buildCoreDocument(result, context);
  return convertCoreDocument(document, format);
}

export async function convertLatexWithCore(latex, format) {
  const { core } = await initCoreRuntime();
  const document = core.parse_latex(String(latex ?? ''));
  return requireSuccessfulArtifact(core.convert_v3(JSON.stringify(document), format));
}
