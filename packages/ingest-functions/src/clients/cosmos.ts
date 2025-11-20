import { CosmosClient } from '@azure/cosmos';

// Singleton instance - initialized once and exported
export const cosmosClient = new CosmosClient(process.env.COSMOS_DB_CONNECTION!);

export const newsDatabase = cosmosClient.database('news-embedding-cluster');
export const articlesContainer = newsDatabase.container('articles');
