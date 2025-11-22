import { articlesContainer } from '../clients/cosmos';

export async function isArticleInDb(articleId: string): Promise<boolean> {
  try {
    const { resource } = await articlesContainer
      .item(articleId, articleId)
      .read();
    return !!resource;
  } catch (error: any) {
    // 404 is expected if the item doesn't exist; anything else is a real error
    if (error.code === 404) return false;
    throw error;
  }
}
