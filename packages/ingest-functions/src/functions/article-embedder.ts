import { app, InvocationContext } from '@azure/functions';
import { OpenAI } from 'openai';
import { BlobServiceClient } from '@azure/storage-blob';
import { getTokenizer, saveToBlob } from '../helpers';
import { ProcessedArticle, EmbeddedArticle } from '../types';

// --- CONFIGURATION ---
const EMBEDDING_MODEL = 'text-embedding-3-small';
const MAX_TOKENS = 1024;
const CONTAINER_NAME = 'news-data'; // The Bucket
const FOLDER_PREFIX = 'inbox'; // The "New" folder

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Blob Service Client
// Uses the specific connection string if provided, otherwise defaults to local emulator
const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.BLOB_STORAGE_CONNECTION || 'UseDevelopmentStorage=true'
);

export async function articleEmbedder(
  message: unknown,
  context: InvocationContext
): Promise<void> {
  const article = message as ProcessedArticle;
  const logPrefix = `[${article.sourceId}]`;

  // 1. SKIP LOGIC
  // If content is insufficient, we still save a placeholder to the blob
  // so the pipeline knows this ID was processed and doesn't get stuck.
  if (
    article.processingStatus === 'skipped' ||
    article.insufficientContent ||
    article.content.trim().length === 0
  ) {
    context.log(
      `${logPrefix} 🚫 Skipping content (ID: ${article.id}). Saving placeholder.`
    );

    await saveToBlob(
      blobServiceClient,
      CONTAINER_NAME,
      FOLDER_PREFIX,
      article,
      context
    );
    return;
  }

  context.log(`${logPrefix} 🔮 Embedding: ${article.title}`);

  try {
    // 2. TOKENIZATION & TRUNCATION
    const enc = getTokenizer();
    const allTokens = enc.encode(article.content);
    const originalTokenCount = allTokens.length;

    let finalContent = article.content;
    let finalTokenCount = originalTokenCount;
    let wasTruncated = false;

    if (originalTokenCount > MAX_TOKENS) {
      const truncatedTokens = allTokens.slice(0, MAX_TOKENS);
      // Decode back to string for OpenAI (handling Uint8Array from tiktoken)
      finalContent = new TextDecoder().decode(enc.decode(truncatedTokens));
      finalTokenCount = MAX_TOKENS;
      wasTruncated = true;
      context.log(
        `${logPrefix} ✂️ Truncated ${originalTokenCount} -> ${finalTokenCount}`
      );
    }

    // 3. CALL OPENAI
    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: finalContent,
    });

    const embedding = embeddingResponse.data[0].embedding;

    // 4. PREPARE FINAL JSON
    const embeddedArticle: EmbeddedArticle = {
      id: article.id,
      url: article.url,
      title: article.title,
      excerpt: article.excerpt,
      sourceId: article.sourceId,
      sourceName: article.sourceName,
      publishedAt: article.publishedAt,
      scrapedAt: article.scrapedAt,
      date: article.date,
      categories: article.categories,
      embedding: embedding,
      embeddedAt: new Date().toISOString(),
      processingStatus: 'embedded',
      content: article.content,
      metadata: {
        originalTokenCount,
        embeddedTokenCount: finalTokenCount,
        wasTruncated,
      },
    };

    // 5. SAVE TO BLOB STORAGE (INBOX)
    await saveToBlob(
      blobServiceClient,
      CONTAINER_NAME,
      FOLDER_PREFIX,
      embeddedArticle,
      context
    );

    context.log(
      `${logPrefix} 💾 Saved to Blob Storage: ${CONTAINER_NAME}/${FOLDER_PREFIX}/${article.id}.json`
    );
  } catch (error) {
    context.error(`${logPrefix} ❌ Failed:`, error);
    throw error; // Rethrow to trigger Service Bus retry
  }
}

// Service Bus Trigger Registration
app.serviceBusQueue('article-embedder', {
  connection: 'SERVICE_BUS_CONNECTION',
  queueName: 'article.enrichment.queue',
  handler: articleEmbedder,
});
