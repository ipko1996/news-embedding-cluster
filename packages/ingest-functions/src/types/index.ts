export interface ArticleQueueMessage {
  sourceId: string;
  sourceName: string;
  title: string;
  link: string;
  publishedAt: string;
}

export interface ProcessedArticle {
  id: string; // Hashed URL (Primary Key)
  url: string;
  title: string;
  content: string; // Clean text
  excerpt: string;
  sourceId: string;
  sourceName: string;
  publishedAt: string;
  scrapedAt: string;
  date: string; // YYYY-MM-DD (Useful for partition filtering later)
  processingStatus: 'pending_embedding'; // Trigger for the next function
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
