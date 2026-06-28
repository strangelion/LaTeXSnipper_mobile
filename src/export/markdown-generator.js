// Markdown generator — produces Markdown output from OcrResult.

export function generateMarkdown(result) {
  if (!result || !result.blocks) return result?.raw || '';
  return result.blocks.map(block => {
    if (block.type === 'formula') {
      return block.mathStyle === 'display'
        ? `$$\n${block.content}\n$$`
        : `$${block.content}$`;
    }
    return block.content;
  }).join('\n\n');
}
