import { app, InvocationContext } from '@azure/functions';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { createHash } from 'crypto';
import { ArticleQueueMessage, ProcessedArticle } from '../types';
import { cleanText } from '../helpers/clean-text';
import { articlesContainer } from '../clients/cosmos';

function generateId(url: string): string {
  return createHash('md5').update(url).digest('hex');
}

export async function articleProcessor(
  message: unknown,
  context: InvocationContext
): Promise<void> {
  const msg = message as ArticleQueueMessage;
  const articleId = generateId(msg.link);
  const logPrefix = `[${msg.sourceId}]`;

  context.log(`${logPrefix} ⚡ Processing: ${msg.title}`);

  try {
    // Check if article already exists in Cosmos DB
    try {
      const { resource: existingArticle } = await articlesContainer
        .item(articleId, articleId)
        .read();

      if (existingArticle) {
        context.log(
          `${logPrefix} ⏭️ Article already exists (ID: ${articleId}). Skipping scrape.`
        );
        return; // Exit early - message completes successfully
      }
    } catch (error: any) {
      // 404 means article doesn't exist, which is what we want
      if (error.code !== 404) {
        throw error; // Unexpected error, let it bubble up for retry
      }
      context.log(
        `${logPrefix} 🆕 Article not found in DB. Proceeding with scrape.`
      );
    }

    // Fetch the article content
    const response = await axios.get(msg.link, {
      timeout: 10000, // 10 seconds timeout
      headers: {
        'User-Agent': 'NewsMonitor/1.0 (Bot)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    // Parse with Readability
    const dom = new JSDOM(response.data, { url: msg.link });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    context.log(`${logPrefix} 🧹 Readability parsed the article.`);

    // Validation: Skip if content is too short
    if (!article || !article.textContent || article.textContent.length < 200) {
      context.warn(
        `${logPrefix} ⚠️ Content empty or too short (<200 chars). Skipping save.`
      );
      return; // Message completes, nothing saved
    }

    context.log(
      `${logPrefix} ✅ Scraped "${article.title}" with ${article.textContent.length} chars.`
    );

    // Prepare the document
    const now = new Date();
    const savedArticle: ProcessedArticle = {
      id: articleId,
      url: msg.link,
      title: cleanText(article.title || msg.title),
      content: cleanText(article.textContent),
      excerpt: cleanText(article.excerpt || ''),
      sourceId: msg.sourceId,
      sourceName: msg.sourceName,
      publishedAt: msg.publishedAt,
      scrapedAt: now.toISOString(),
      date: now.toISOString().split('T')[0],
      processingStatus: 'pending_embedding',
    };

    // Save to Cosmos DB (upsert)

    await articlesContainer.items.upsert(savedArticle);

    context.log(
      `${logPrefix} 💾 Saved article to Cosmos DB (ID: ${articleId}).`
    );
  } catch (error) {
    context.error(
      `${logPrefix} ❌ Error processing article: ${(error as Error).message}`
    );
    // Throwing tells Service Bus to retry
    throw error;
  }
}

app.serviceBusQueue('article-processor', {
  connection: 'SERVICE_BUS_CONNECTION',
  queueName: 'articles.process.queue',
  handler: articleProcessor,
});
