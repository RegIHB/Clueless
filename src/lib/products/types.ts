export type ProductSearchHit = {
  id: string;
  title: string;
  imageUrl: string;
  thumbnailUrl: string;
  sourceUrl: string;
  attribution?: string;
};

export type ProductSearchSource = 'serpapi' | 'google' | 'openverse' | 'google_lens' | 'vision';
