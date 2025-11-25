import { app, InvocationContext, output } from '@azure/functions';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

import { ArticleQueueMessage, ProcessedArticle } from '../types';
import { cleanText, isArticleInDb, generateId, delay } from '../helpers';

const CONTENT_THRESHOLD = 300;
const REQUEST_DELAY = 2000;

const enrichmentQueueOutput = output.serviceBusQueue({
  queueName: 'article.enrichment.queue',
  connection: 'SERVICE_BUS_CONNECTION',
});

export async function articleProcessor(
  message: unknown,
  context: InvocationContext
): Promise<ProcessedArticle | null> {
  const msg = message as ArticleQueueMessage;
  const articleId = generateId(msg.link);
  const logPrefix = `[${msg.sourceId}]`;

  context.log(`${logPrefix} ⚡ Processing: ${msg.title}`);

  try {
    // Check if already exists
    if (await isArticleInDb(articleId)) {
      context.log(
        `${logPrefix} ⭐️ Article already exists (ID: ${articleId}). Skipping.`
      );
      return null;
    }

    await delay(REQUEST_DELAY);

    const response = await axios.get(msg.link, {
      timeout: 10000,
      headers: {
        'User-Agent': 'NewsEmbeddinCluster/1.0 (Bot)',
        Accept: 'text/html,application/xhtml+xml',
      },
      validateStatus: (status) => status < 500, // Don't throw on 4xx errors
    });

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers['retry-after'];
      context.warn(
        `${logPrefix} ⚠️ Rate limited (429). Retry after: ${
          retryAfter || 'unknown'
        }`
      );
      throw new Error('Rate limited - will retry');
    }

    if (response.status >= 400) {
      context.warn(
        `${logPrefix} ⚠️ HTTP ${response.status} error. Skipping article.`
      );
      return null;
    }

    const dom = new JSDOM(response.data, { url: msg.link });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    const content = cleanText(article?.textContent || '');
    if (!article || content.length < CONTENT_THRESHOLD) {
      context.warn(
        `${logPrefix} ⚠️ Article with the title "${msg.title}" has insufficient content.`
      );
      context.warn(
        `${logPrefix} Content empty or too short (<${CONTENT_THRESHOLD} chars). Creating placeholder article to avoid re-query.`
      );

      const now = new Date();
      const placeholderArticle: ProcessedArticle = {
        id: articleId,
        url: msg.link,
        title: msg.title,
        content: '', // intentionally empty to signal insufficient content
        excerpt: cleanText(article?.excerpt || '', false),
        sourceId: msg.sourceId,
        sourceName: msg.sourceName,
        publishedAt: msg.publishedAt,
        scrapedAt: now.toISOString(),
        date: now.toISOString().split('T')[0],
        categories: msg.categories,
        processingStatus: 'skipped',
        insufficientContent: true,
        skipReason: 'insufficient_content',
      };

      context.log(
        `${logPrefix} 💤 Placeholder queued (ID: ${articleId}) - will be saved without embedding.`
      );
      return placeholderArticle; // send to enrichment queue for saving logic, embedding will skip
    }

    const now = new Date();
    const processedArticle: ProcessedArticle = {
      id: articleId,
      url: msg.link,
      title: msg.title,
      content: content,
      excerpt: cleanText(article.excerpt || '', false),
      sourceId: msg.sourceId,
      sourceName: msg.sourceName,
      publishedAt: msg.publishedAt,
      scrapedAt: now.toISOString(),
      date: now.toISOString().split('T')[0],
      categories: msg.categories,
      processingStatus: 'pending',
      insufficientContent: false,
    };

    context.log(
      `${logPrefix} 📤 Sending article to enrichment queue (ID: ${articleId}).`
    );

    return processedArticle;
  } catch (error) {
    const err = error as Error;
    context.error(`${logPrefix} ❌ Failed:`, error);

    // Retry on rate limiting or network errors
    if (
      err.message.includes('Rate limited') ||
      err.message.includes('ETIMEDOUT')
    ) {
      throw error; // Let Service Bus retry
    }

    // Don't retry on other errors
    return null;
  }
}

app.serviceBusQueue('article-processor', {
  connection: 'SERVICE_BUS_CONNECTION',
  queueName: 'articles.process.queue',
  return: enrichmentQueueOutput,
  handler: articleProcessor,
});
