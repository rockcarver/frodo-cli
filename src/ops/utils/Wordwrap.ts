export default function wordwrap(
  str: string,
  len: number,
  indent: string = undefined
) {
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
