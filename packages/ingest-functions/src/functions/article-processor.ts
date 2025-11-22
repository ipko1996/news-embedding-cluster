import { app, InvocationContext } from '@azure/functions';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

import { ArticleQueueMessage, ProcessedArticle } from '../types';
import { cleanText, isArticleInDb } from '../helpers';
import { articlesContainer } from '../clients/cosmos';
import { generateId } from '../helpers';

const CONTENT_THRESHOLD = 100;

export async function articleProcessor(
  message: unknown,
  context: InvocationContext
): Promise<void> {
  const msg = message as ArticleQueueMessage;
  const articleId = generateId(msg.link);
  const logPrefix = `[${msg.sourceId}]`;

  context.log(`${logPrefix} ⚡ Processing: ${msg.title}`);

  try {
    if (await isArticleInDb(articleId)) {
      context.log(
        `${logPrefix} ⏭️ Article already exists (ID: ${articleId}). Skipping.`
      );
      return;
    }

    const response = await axios.get(msg.link, {
      timeout: 10000,
      headers: {
        'User-Agent': 'NewsEmbeddinCluster/1.0 (Bot)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    const dom = new JSDOM(response.data, { url: msg.link });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    const content = cleanText(article?.textContent || '');
    if (!article || content.length < CONTENT_THRESHOLD) {
      context.warn(
        `${logPrefix} ⚠️ Content empty or too short (<${CONTENT_THRESHOLD} chars). Skipping.`
      );
      return;
    }

    const now = new Date();
    const savedArticle: ProcessedArticle = {
      id: articleId,
      url: msg.link,
      title: cleanText(article.title || msg.title),
      content: content,
      excerpt: cleanText(article.excerpt || ''),
      sourceId: msg.sourceId,
      sourceName: msg.sourceName,
      publishedAt: msg.publishedAt,
      scrapedAt: now.toISOString(),
      date: now.toISOString().split('T')[0],
      processingStatus: 'pending_embedding',
    };

    await articlesContainer.items.upsert(savedArticle);
    context.log(
      `${logPrefix} 💾 Saved article to Cosmos DB (ID: ${articleId}).`
    );
  } catch (error) {
    context.error(`${logPrefix} ❌ Failed: ${(error as Error).message}`);
    throw error;
  }
}

app.serviceBusQueue('article-processor', {
  connection: 'SERVICE_BUS_CONNECTION',
  queueName: 'articles.process.queue',
  handler: articleProcessor,
});
