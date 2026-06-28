// ONNX Metadata Analyzer — reads .onnx files to extract input/output shapes
// and auto-detects model type. Works in browser (File) and Node (Buffer).

/**
 * Analyze an ONNX file and infer its model category.
 * @param {ArrayBuffer|Buffer} buffer - The .onnx file content
 * @returns {{ category: string, confidence: number, inputs: object[], outputs: object[] }}
 */
export function analyzeOnnx(buffer) {
  const bytes = new Uint8Array(buffer);
  const info = parseOnnxProto(bytes);
  const category = inferCategory(info.inputs, info.outputs, info.opTypes);

  return {
    category: category.name,
    confidence: category.confidence,
    inputs: info.inputs,
    outputs: info.outputs,
    opTypes: info.opTypes,
  };
}

// ── Minimal ONNX protobuf parser ──

function parseOnnxProto(bytes) {
  const inputs = [];
  const outputs = [];
  const opTypes = [];

  try {
    let offset = 8; // skip magic (4) + ir_version (4)

    while (offset < bytes.length - 4) {
      const [tag, bytesRead] = readVarint(bytes, offset);
      if (bytesRead === 0) break;

      const fieldNumber = tag >> 3;
      const wireType = tag & 0x7;

      if (wireType === 2) {
        const [length, lenBytes] = readVarint(bytes, offset + bytesRead);
        if (lenBytes === 0) break;
        const fieldStart = offset + bytesRead + lenBytes;
        const fieldEnd = Math.min(fieldStart + length, bytes.length);

        if (fieldNumber === 7) { // graph field
          parseGraph(bytes, fieldStart, fieldEnd, inputs, outputs, opTypes);
        }

        offset = fieldEnd;
      } else if (wireType === 0) {
        const [, skip] = readVarint(bytes, offset + bytesRead);
        offset += bytesRead + skip;
      } else if (wireType === 5) {
        offset += 4;
      } else if (wireType === 1) {
        offset += 8;
      } else {
        break;
      }
    }
  } catch {}

  return { inputs, outputs, opTypes };
}

function readVarint(bytes, offset) {
  let result = 0;
  let shift = 0;
  let bytesRead = 0;
  while (offset + bytesRead < bytes.length) {
    const b = bytes[offset + bytesRead];
    result |= (b & 0x7F) << shift;
    bytesRead++;
    if ((b & 0x80) === 0) return [result, bytesRead];
    shift += 7;
    if (shift > 35) break;
  }
  return [0, 0];
}

function parseGraph(bytes, start, end, inputs, outputs, opTypes) {
  let offset = start;
  while (offset < end - 4) {
    const [tag, bytesRead] = readVarint(bytes, offset);
    if (bytesRead === 0) break;
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x7;

    if (wireType === 2) {
      const [length, lenBytes] = readVarint(bytes, offset + bytesRead);
      if (lenBytes === 0) break;
      const fieldStart = offset + bytesRead + lenBytes;
      const fieldEnd = Math.min(fieldStart + length, end);

      if (fieldNumber === 11) { // input
        const shape = parseValueInfo(bytes, fieldStart, fieldEnd);
        if (shape) inputs.push(shape);
      } else if (fieldNumber === 12) { // output
        const shape = parseValueInfo(bytes, fieldStart, fieldEnd);
        if (shape) outputs.push(shape);
      } else if (fieldNumber === 5) { // node
        const opType = parseNode(bytes, fieldStart, fieldEnd);
        if (opType) opTypes.push(opType);
      }

      offset = fieldEnd;
    } else if (wireType === 0) {
      const [, skip] = readVarint(bytes, offset + bytesRead);
      offset += bytesRead + skip;
    } else if (wireType === 5) {
      offset += 4;
    } else if (wireType === 1) {
      offset += 8;
    } else {
      break;
    }
  }
}

function parseValueInfo(bytes, start, end) {
  let name = '';
  let dims = [];
  let offset = start;

  while (offset < end - 4) {
    const [tag, bytesRead] = readVarint(bytes, offset);
    if (bytesRead === 0) break;
    const fn = tag >> 3;
    const wt = tag & 0x7;

    if (wt === 2) {
      const [len, lenB] = readVarint(bytes, offset + bytesRead);
      if (lenB === 0) break;
      const fs = offset + bytesRead + lenB;
      const fe = Math.min(fs + len, end);

      if (fn === 1) { // name
        name = readString(bytes, fs, fe);
      } else if (fn === 2) { // type
        dims = parseTypeProto(bytes, fs, fe);
      }

      offset = fe;
    } else if (wt === 0) {
      const [, skip] = readVarint(bytes, offset + bytesRead);
      offset += bytesRead + skip;
    } else {
      break;
    }
  }

  return name ? { name, dims } : null;
}

function parseTypeProto(bytes, start, end) {
  let dims = [];
  let offset = start;

  while (offset < end - 4) {
    const [tag, bytesRead] = readVarint(bytes, offset);
    if (bytesRead === 0) break;
    const fn = tag >> 3;
    const wt = tag & 0x7;

    if (wt === 2) {
      const [len, lenB] = readVarint(bytes, offset + bytesRead);
      if (lenB === 0) break;
      const fs = offset + bytesRead + lenB;
      const fe = Math.min(fs + len, end);

      if (fn === 1) { // tensor_type
        dims = parseTensorTypeProto(bytes, fs, fe);
      }
      offset = fe;
    } else if (wt === 0) {
      const [, skip] = readVarint(bytes, offset + bytesRead);
      offset += bytesRead + skip;
    } else {
      break;
    }
  }
  return dims;
}

function parseTensorTypeProto(bytes, start, end) {
  let dims = [];
  let offset = start;

  while (offset < end - 4) {
    const [tag, bytesRead] = readVarint(bytes, offset);
    if (bytesRead === 0) break;
    const fn = tag >> 3;
    const wt = tag & 0x7;

    if (wt === 2) {
      const [len, lenB] = readVarint(bytes, offset + bytesRead);
      if (lenB === 0) break;
      const fs = offset + bytesRead + lenB;
      const fe = Math.min(fs + len, end);

      if (fn === 5) { // shape
        dims = parseTensorShapeProto(bytes, fs, fe);
      }
      offset = fe;
    } else if (wt === 0) {
      const [, skip] = readVarint(bytes, offset + bytesRead);
      offset += bytesRead + skip;
    } else {
      break;
    }
  }
  return dims;
}

function parseTensorShapeProto(bytes, start, end) {
  const dims = [];
  let offset = start;

  while (offset < end - 4) {
    const [tag, bytesRead] = readVarint(bytes, offset);
    if (bytesRead === 0) break;
    const fn = tag >> 3;
    const wt = tag & 0x7;

    if (wt === 0 && fn === 1) { // dim (varint)
      const [dimVal, dimB] = readVarint(bytes, offset + bytesRead);
      if (dimB > 0) dims.push(dimVal);
      offset += bytesRead + dimB;
    } else if (wt === 2 && fn === 1) { // dim (denotation string)
      const [len, lenB] = readVarint(bytes, offset + bytesRead);
      if (lenB === 0) break;
      offset += bytesRead + lenB + len;
    } else {
      break;
    }
  }
  return dims;
}

function parseNode(bytes, start, end) {
  let opType = '';
  let offset = start;

  while (offset < end - 4) {
    const [tag, bytesRead] = readVarint(bytes, offset);
    if (bytesRead === 0) break;
    const fn = tag >> 3;
    const wt = tag & 0x7;

    if (wt === 2 && fn === 2) { // op_type string
      const [len, lenB] = readVarint(bytes, offset + bytesRead);
      if (lenB === 0) break;
      opType = readString(bytes, offset + bytesRead + lenB, offset + bytesRead + lenB + len);
      break;
    } else if (wt === 0) {
      const [, skip] = readVarint(bytes, offset + bytesRead);
      offset += bytesRead + skip;
    } else {
      break;
    }
  }
  return opType;
}

function readString(bytes, start, end) {
  let s = '';
  for (let i = start; i < end; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

// ── Model type inference ──

/**
 * Infer model category from input/output shapes and operator types.
 * @returns {{ name: string, confidence: number }}
 */
export function inferCategory(inputs, outputs, opTypes) {
  const inputShape = inputs[0]?.dims || [];
  const outputShape = outputs[0]?.dims || [];
  const opSet = new Set(opTypes);

  // Two inputs (input_ids + hidden_states) → formula recognition decoder
  if (inputs.length >= 2) {
    const hasIds = inputs.some(i => i.name?.includes('input_ids') || i.name?.includes('ids'));
    const hasHidden = inputs.some(i => i.name?.includes('hidden') || i.name?.includes('encoder'));
    if (hasIds && hasHidden) {
      return { name: 'formula-rec-decoder', confidence: 0.9 };
    }
  }

  // [1,3,384,384] → [1, N, 384] → formula recognition encoder (TrOCR)
  if (inputShape.length === 4 && inputShape[1] === 3
      && inputShape[2] === 384 && inputShape[3] === 384) {
    if (outputShape.length === 3 && outputShape[2] === 384) {
      return { name: 'formula-rec-encoder', confidence: 0.9 };
    }
  }

  // [1,3,768,768] → detection output → formula detection (YOLOv8)
  if (inputShape.length === 4 && inputShape[1] === 3 && inputShape[2] >= 640) {
    if (opSet.has('Slice') || opSet.has('Concat') || outputShape.length === 3) {
      return { name: 'formula-det', confidence: 0.8 };
    }
  }

  // Single model: [1,3,H,W] → [1,1,H,W] → text detection (DBNet)
  if (inputShape.length === 4 && inputShape[1] === 3) {
    if (outputShape.length === 4 && outputShape[1] === 1) {
      return { name: 'text-det', confidence: 0.85 };
    }
    // [1,3,48,320] → [1, seq, vocab] → text recognition (CRNN)
    if (inputShape[2] === 48 && inputShape[3] === 320) {
      if (outputShape.length === 3) {
        return { name: 'text-rec', confidence: 0.9 };
      }
    }
    // [1,3,64,64] → [1,2] → region classification
    if (inputShape[2] === 64 && inputShape[3] === 64) {
      if (outputShape.length === 2 && outputShape[1] === 2) {
        return { name: 'region-det', confidence: 0.85 };
      }
    }
    // [1,3,224,224] → [1,4] → document orientation
    if (inputShape[2] === 224 && inputShape[3] === 224) {
      if (outputShape.length === 2 && outputShape[1] === 4) {
        return { name: 'doc-ori', confidence: 0.85 };
      }
    }
  }

  // PP-FormulaNet: single model with Softmax/ArgMax
  if (inputShape.length === 4 && inputShape[1] === 3
      && (opSet.has('Softmax') || opSet.has('ArgMax'))) {
    if (inputShape[2] >= 224 && inputShape[2] <= 480) {
      return { name: 'formula-rec', confidence: 0.6 };
    }
  }

  return { name: 'unknown', confidence: 0 };
}
