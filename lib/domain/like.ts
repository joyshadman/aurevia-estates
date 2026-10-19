// Prisma's `contains` passes `%` and `_` to SQL LIKE as wildcards, so user text
// must be escaped to match literally (backslash is Postgres's default escape).
export function likeLiteral(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}
