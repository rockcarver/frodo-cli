export default function wordwrap(str, len, indent = undefined) {
  if (!str) return '';
  return (
    str.match(
      new RegExp(
        `(\\S.{0,${len - 1 - (indent ? indent.length : 0)}})(?=\\s+|$)`,
        'g'
      )
    ) || []
  ).join(indent ? `\n${indent}` : '\n');
}
