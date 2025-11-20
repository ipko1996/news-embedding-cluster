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
