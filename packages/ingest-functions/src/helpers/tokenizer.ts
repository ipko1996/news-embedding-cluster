import { get_encoding, Tiktoken } from 'tiktoken';

// Singleton tokenizer instance to avoid repeated WASM initialization
let tokenizer: Tiktoken | null = null;

export function getTokenizer(): Tiktoken {
  if (!tokenizer) {
    try {
      tokenizer = get_encoding('cl100k_base');
    } catch (e) {
      // Retry once if initialization fails
      console.error('Failed to initialize tokenizer, retrying...', e);
      tokenizer = get_encoding('cl100k_base');
    }
  }
  return tokenizer;
}
