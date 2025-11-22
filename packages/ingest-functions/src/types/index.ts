export interface ArticleQueueMessage {
  sourceId: string;
  sourceName: string;
  title: string;
  link: string;
  publishedAt: string;
  categories: string[]; // cleaned category names
}

export interface BaseArticle {
  id: string;
  url: string;
  title: string;
  excerpt: string;
  sourceId: string;
  sourceName: string;
  publishedAt: string;
  scrapedAt: string;
  date: string; // YYYY-MM-DD
  categories: string[]; // cleaned category names (may be empty)
}

export interface ProcessedArticle extends BaseArticle {
  content: string;
  processingStatus: 'pending_embedding';
}

export interface EmbeddedArticle extends BaseArticle {
  embedding: number[];
  embeddedAt: string;
  processingStatus: 'embedded';
  metadata?: {
    originalTokenCount: number;
    embeddedTokenCount: number;
    wasTruncated: boolean;
  };
}

export interface NewsSource {
  id: string;
  name: string;
  url: string;
  isActive?: boolean;
  excludeCategories?: string[];
}

// These allow you to extract non-standard fields later (like images in content:encoded)
// Standard fields (title, link, pubDate, etc.) are included automatically by the library.
export type CustomFeed = {
  // Example: managingEditor?: string;
};

export type CustomItem = {
  // Example: 'content:encoded'?: string;
  category?: string | string[];
};
