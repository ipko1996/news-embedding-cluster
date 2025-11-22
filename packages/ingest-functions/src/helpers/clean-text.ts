export function cleanText(
  text: string | undefined,
  toLowerCase: boolean = true
): string {
  if (!text) return '';
  // Remove HTML tags
  let cleaned = text.replace(/<[^>]*>?/gm, '');
  // Remove double spaces/newlines
  cleaned = cleaned.replace(/\s\s+/g, ' ').trim();
  // Lowercase
  cleaned = toLowerCase ? cleaned.toLowerCase() : cleaned;
  return cleaned;
}
