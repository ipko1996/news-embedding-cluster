import { NewsSource } from './types';

export const HUNGARIAN_SOURCES: NewsSource[] = [
  {
    id: 'telex-hu',
    name: 'Telex',
    url: 'https://telex.hu/rss',
    excludeCategories: ['English'],
  },
  {
    id: '24-hu',
    name: '24.hu',
    url: 'https://24.hu/feed/',
  },
  {
    id: '444-hu',
    name: '444',
    url: 'https://444.hu/feed',
  },
  {
    id: 'index-hu',
    name: 'Index',
    url: 'https://index.hu/24ora/rss/',
  },
  {
    id: 'hvg-hu',
    name: 'HVG',
    url: 'https://hvg.hu/rss',
  },
  {
    id: 'portfolio-hu',
    name: 'Portfolio',
    url: 'https://www.portfolio.hu/rss/all.xml',
  },
  {
    id: 'origo-hu',
    name: 'Origo',
    url: 'https://www.origo.hu/publicapi/hu/rss/origo/articles',
  },
  {
    id: 'magyarnemzet-hu',
    name: 'Magyarnemzet',
    url: 'https://magyarnemzet.hu/publicapi/hu/rss/magyar_nemzet/articles',
  },
  {
    id: 'tenyek-hu',
    name: 'Tények',
    url: 'https://tenyek.hu/publicapi/hu/rss',
  },
  {
    id: 'mandiner-hu',
    name: 'Mandiner',
    url: 'https://mandiner.hu/publicapi/hu/rss/mandiner/articles',
  },
];
