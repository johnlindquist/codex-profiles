export function dedent(strings: TemplateStringsArray, ...values: unknown[]) {
  const raw = strings.reduce((acc, part, index) => `${acc}${part}${values[index] ?? ''}`, '');
  const lines = raw.replace(/^\n/, '').replace(/\n\s*$/, '').split('\n');
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^\s*/)?.[0].length ?? 0);
  const min = Math.min(...indents, 0);
  return lines.map((line) => line.slice(min)).join('\n');
}
