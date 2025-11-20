import { app, InvocationContext, output } from '@azure/functions';
import Parser from 'rss-parser';
import { NewsSource } from '../types';
import { ArticleQueueMessage } from '../types';
import { cleanText } from '../helpers/clean-text';

// These allow you to extract non-standard fields later (like images in content:encoded)
// Standard fields (title, link, pubDate, etc.) are included automatically by the library.
type CustomFeed = {
  // Example: managingEditor?: string;
};

type CustomItem = {
  // Example: 'content:encoded'?: string;
  category?: string | string[];
};

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

// Helper to check if item's category should be excluded
function shouldExcludeItem(
  item: CustomItem,
  excludeCategories?: string[]
): boolean {
  if (!excludeCategories || excludeCategories.length === 0) {
    return false;
  }
  if (!item.category) {
    return false;
  }

  const itemCategories = Array.isArray(item.category)
    ? item.category
    : [item.category];

  const [cleanedCategories, normalizedExcluded] = [
    itemCategories.map((cat) => cleanText(cat).toLowerCase()),
    excludeCategories.map((cat) => cat.toLowerCase().trim()),
  ];

  return cleanedCategories.some((cat) => normalizedExcluded.includes(cat));
}

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

    const articlesToSend: ArticleQueueMessage[] = [];

    for (const item of feed.items) {
      if (!item.link || !item.title) {
        context.warn(
          `${logPrefix} ⚠️ Skipping item due to missing title or link.`
        );
        continue;
      }

      if (shouldExcludeItem(item, source.excludeCategories)) {
        context.log(
          `${logPrefix} 🚫 Filtered out by category: ${cleanText(item.title)}`
        );
        continue;
      }

      const cleanTitle = cleanText(item.title);
      const cleanLink = item.link.trim();

      const pubDate = item.isoDate || item.pubDate || new Date().toISOString();

      articlesToSend.push({
        sourceId: source.id,
        sourceName: source.name,
        title: cleanTitle,
        link: cleanLink,
        publishedAt: pubDate,
      });
    }

    context.log(
      `${logPrefix} 📤 Sending ${articlesToSend.length} valid articles to processing queue.`
    );

    // For testing send only two from the array
    return articlesToSend.slice(0, 10); // <--- REMOVE OR COMMENT THIS OUT TO ENABLE SENDING

    return articlesToSend;
  } catch (error) {
    context.error(
      `${logPrefix} ❌ Failed to parse RSS: ${(error as Error).message}`
    );
    // Return empty array on failure so the message is acknowledged (and not retried infinitely)
    return [];
  }
}

app.serviceBusQueue('feed-parser', {
  connection: 'SERVICE_BUS_CONNECTION',
  queueName: 'sources.dispatch.queue',
  return: articleQueueOutput,
  handler: feedParser,
});
