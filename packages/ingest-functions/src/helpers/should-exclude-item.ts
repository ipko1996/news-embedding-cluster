import { CustomItem } from '../types';
import { cleanText } from './clean-text';

export function shouldExcludeItem(
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
