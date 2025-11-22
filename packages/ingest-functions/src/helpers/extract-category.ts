export function extractCategory(c: any): string[] {
  if (!c) return [];
  if (Array.isArray(c)) return c.flatMap(extractCategory);
  if (typeof c === 'string') return [c];
  if (typeof c === 'object' && typeof c._ === 'string') return [c._];
  return [];
}
