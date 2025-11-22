import { app, InvocationContext } from '@azure/functions';
import { OpenAI } from 'openai';
import { ProcessedArticle, EmbeddedArticle } from '../types';
import { articlesContainer } from '../clients/cosmos';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_MODEL: OpenAI.Embeddings.EmbeddingModel =
  'text-embedding-3-small';

export async function articleEmbedder(
  message: unknown,
  context: InvocationContext
): Promise<void> {
  const article = message as ProcessedArticle;
  const logPrefix = `[${article.sourceId}]`;

  context.log(`${logPrefix} 🔮 Embedding: ${article.title}`);

  try {
    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: article.content,
    });

    const embedding = embeddingResponse.data[0].embedding;

    // Create document WITHOUT the full content text (copyright protection)
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
      embedding: embedding,
      embeddedAt: new Date().toISOString(),
      processingStatus: 'embedded',
    };

    await articlesContainer.items.upsert(embeddedArticle);

    context.log(
      `${logPrefix} 💾 Saved embedding to Cosmos DB (ID: ${article.id}, dimensions: ${embedding.length}).`
    );
  } catch (error) {
    context.error(`${logPrefix} ❌ Failed: ${(error as Error).message}`);
    throw error;
  }
}

app.serviceBusQueue('article-embedder', {
  connection: 'SERVICE_BUS_CONNECTION',
  queueName: 'article.enrichment.queue',
  handler: articleEmbedder,
});
