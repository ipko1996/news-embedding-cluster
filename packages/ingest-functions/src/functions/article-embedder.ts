import { app, InvocationContext } from '@azure/functions';
import { OpenAI } from 'openai';
import { getTokenizer } from '../helpers';
import { ProcessedArticle, EmbeddedArticle } from '../types';
import { articlesContainer } from '../clients/cosmos';

const EMBEDDING_MODEL: OpenAI.Embeddings.EmbeddingModel =
  'text-embedding-3-small';

// For topic clustering, research shows first 512-1024 tokens capture main themes
// Using 1024 as a good balance between coverage and efficiency
const MAX_TOKENS = 1024;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function articleEmbedder(
  message: unknown,
  context: InvocationContext
): Promise<void> {
  const article = message as ProcessedArticle;
  const logPrefix = `[${article.sourceId}]`;

  // Skip embedding if flagged as insufficient.
  if (
    article.processingStatus === 'skipped_insufficient_content' ||
    article.insufficientContent ||
    article.content.trim().length === 0
  ) {
    context.log(
      `${logPrefix} 🚫 Skipping embedding for insufficient content (ID: ${article.id}). Saving placeholder.`
    );
    // Upsert the placeholder (no embedding) so it's stored and won't be re-fetched.
    await articlesContainer.items.upsert(article);
    context.log(
      `${logPrefix} 💾 Saved placeholder article to Cosmos DB (ID: ${article.id})`
    );
    return; // do not proceed to embedding
  }

  context.log(`${logPrefix} 🔮 Embedding: ${article.title}`);

  try {
    const enc = getTokenizer();

    const allTokens = enc.encode(article.content);
    const originalTokenCount = allTokens.length;

    let finalContent = article.content;
    let finalTokenCount = originalTokenCount;
    let wasTruncated = false;

    if (originalTokenCount > MAX_TOKENS) {
      const truncatedTokens = allTokens.slice(0, MAX_TOKENS);

      // Decode back to string for OpenAI
      // Tiktoken JS returns Uint8Array, requiring TextDecoder
      finalContent = new TextDecoder().decode(enc.decode(truncatedTokens));

      finalTokenCount = MAX_TOKENS;
      wasTruncated = true;

      context.log(
        `${logPrefix} ✂️ Truncated from ${originalTokenCount} to ${finalTokenCount} tokens`
      );
    }

    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: finalContent,
    });

    const embedding = embeddingResponse.data[0].embedding;

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
      metadata: {
        originalTokenCount,
        embeddedTokenCount: finalTokenCount,
        wasTruncated,
      },
    };

    await articlesContainer.items.upsert(embeddedArticle);

    context.log(
      `${logPrefix} 💾 Saved embedding to Cosmos DB (ID: ${article.id})`
    );
  } catch (error) {
    context.error(`${logPrefix} ❌ Failed:`, error);
    throw error;
  }
}

app.serviceBusQueue('article-embedder', {
  connection: 'SERVICE_BUS_CONNECTION',
  queueName: 'article.enrichment.queue',
  handler: articleEmbedder,
});
