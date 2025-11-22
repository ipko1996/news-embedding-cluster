import { app, InvocationContext, output } from '@azure/functions';
import Parser from 'rss-parser';
import { CustomFeed, CustomItem, NewsSource } from '../types';
import { ArticleQueueMessage } from '../types';
import { cleanText, extractCategory } from '../helpers';

const parser = new Parser<CustomFeed, CustomItem>({
  timeout: 5000,
  headers: {
    'User-Agent': 'NewsMonitor/1.0 (Internal Research Tool)',
  },
});

const articleQueueOutput = output.serviceBusQueue({
  queueName: 'articles.process.queue',
  connection: 'SERVICE_BUS_CONNECTION',
});

export async function feedParser(
  message: unknown,
  context: InvocationContext
): Promise<ArticleQueueMessage[]> {
  const source = message as NewsSource;
  const logPrefix = `[${source.id}]`;

  context.log(`${logPrefix} 📥 Received feed for parsing: ${source.url}`);

  try {
    const feed = await parser.parseURL(source.url);
    context.log(`${logPrefix} ✅ Fetched. Found ${feed.items.length} items.`);

    const excludedSet = new Set(
      (source.excludeCategories || []).map((c) => c.toLowerCase().trim())
    );

    const articlesToSend: ArticleQueueMessage[] = [];

    for (const item of feed.items) {
      if (!item.link || !item.title) {
        context.warn(
          `${logPrefix} ⚠️ Skipping item due to missing title or link.`
        );
        continue;
      }

      const cleanTitle = cleanText(item.title, false);

      const rawCategories = [
        ...extractCategory(item.category),
        ...extractCategory(item.categories),
      ];

      const categories = Array.from(
        new Set(
          rawCategories.map((c) => cleanText(c)).filter((c) => c.length > 0)
        )
      );

      const isExcluded = categories.some((cat) => excludedSet.has(cat));

      if (isExcluded) {
        context.log(`${logPrefix} 🚫 Filtered out by category: ${cleanTitle}`);
        continue;
      }

      const cleanLink = item.link.trim();
      const pubDate = item.isoDate || item.pubDate || new Date().toISOString();

      articlesToSend.push({
        sourceId: source.id,
        sourceName: source.name,
        title: cleanTitle,
        link: cleanLink,
        publishedAt: pubDate,
        categories,
      });
    }

    context.log(
      `${logPrefix} 📤 Sending ${articlesToSend.length} valid articles to processing queue.`
    );

    // TODO: Remove slice before production
    return articlesToSend; // .slice(0, 10);
  } catch (error) {
    context.error(
      `${logPrefix} ❌ Failed to parse RSS: ${(error as Error).message}`
    );
    return [];
  }
}

app.serviceBusQueue('feed-parser', {
  connection: 'SERVICE_BUS_CONNECTION',
  queueName: 'sources.dispatch.queue',
  return: articleQueueOutput,
  handler: feedParser,
});
