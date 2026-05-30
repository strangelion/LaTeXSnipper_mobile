// AI polish (LaTeX error correction via LLM)
import { els } from './dom-refs.js';
import { renderMathPreview } from './result.js';

export async function polishResult() {
  if (!els.resultCode) return;
  const latex = els.resultCode.textContent;
  if (!latex || latex.trim().length < 2) return;

  let settings = {};
  try { settings = JSON.parse(localStorage.getItem('ls_settings') || '{}'); } catch (_) {}
  const baseUrl = settings.polishBaseUrl || 'https://api.deepseek.com';
  const model = settings.polishModel || 'deepseek-chat';
  const apiKey = settings.polishApiKey || '';

  if (!apiKey) {
    if (els.statusText) els.statusText.textContent = '请先在设置中配置 AI 整理的 API Key';
    return;
  }

  const btn = document.getElementById('aiPolishBtn');
  if (btn) { btn.textContent = '整理中…'; btn.disabled = true; }

  try {
    const resp = await fetch(baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: '你是一个 LaTeX 纠错和格式化专家。请纠正用户输入的 LaTeX 公式中的语法错误、括号不匹配、命令拼写错误等问题，并保持数学语义不变。只输出修复后的 LaTeX 代码，不要任何解释或额外标记。如果无法修复，输出原始内容。',
          },
          { role: 'user', content: latex },
        ],
        max_tokens: 2048,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) throw new Error('API error: HTTP ' + resp.status);
    const data = await resp.json();
    let polished = data.choices?.[0]?.message?.content || '';
    polished = polished.replace(/```(?:latex|tex)?\n?/gi, '').replace(/```\n?/g, '').trim();

    if (polished && polished !== latex) {
      els.resultCode.textContent = polished;
      renderMathPreview(polished);
      if (els.statusText) els.statusText.textContent = 'AI 整理完成';
    } else if (polished) {
      if (els.statusText) els.statusText.textContent = '无需修改';
    }
  } catch (e) {
    if (els.statusText) els.statusText.textContent = 'AI 整理失败: ' + (e.message || e);
  } finally {
    if (btn) { btn.textContent = 'AI 整理'; btn.disabled = false; }
  }
}
