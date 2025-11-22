export function cleanText(text: string | undefined): string {
  if (!text) return '';
  // Remove HTML tags
  let cleaned = text.replace(/<[^>]*>?/gm, '');
  // Remove double spaces/newlines
  cleaned = cleaned.replace(/\s\s+/g, ' ').trim();
  // Lowercase
  cleaned = cleaned.toLowerCase();
  return cleaned;
}
