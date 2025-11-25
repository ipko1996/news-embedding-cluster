import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  pgEnum,
  vector,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const processingStatusEnum = pgEnum('processing_status', [
  'pending',
  'embedded',
  'skipped',
  'failed',
]);

export type ProcessingStatus = (typeof processingStatusEnum.enumValues)[number];

export const sources = pgTable('sources', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
});

export const sourcesRelations = relations(sources, ({ many }) => ({
  articles: many(articles),
}));

export const articles = pgTable(
  'articles',
  {
    id: text('id').primaryKey(),
    url: text('url').notNull().unique(),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    excerpt: text('excerpt'),
    publishedAt: timestamp('published_at'),
    scrapedAt: timestamp('scraped_at').defaultNow().notNull(),
    categories: text('categories').array(),
    embedding: vector('embedding', { dimensions: 1536 }),
    status: processingStatusEnum('status').default('pending').notNull(),
    metadata: jsonb('metadata'),
    storyId: text('story_id'),
  },
  (table) => [
    index('articles_published_at_idx').on(table.publishedAt),
    index('articles_source_id_idx').on(table.sourceId),
    index('articles_embedding_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
      sql.raw('m = 16, ef_construction = 64')
    ),
    uniqueIndex('articles_story_id_unique').on(table.storyId),
  ]
);

export const articlesRelations = relations(articles, ({ one }) => ({
  source: one(sources, {
    fields: [articles.sourceId],
    references: [sources.id],
  }),
}));
