/**
 * Demo wardrobe inventory: product-style photos (flat lays / isolated garments on neutral backgrounds).
 * Unsplash URLs use stable photo ids; replace anytime with your own catalog assets.
 */

import type { WardrobeItem } from '@/types/wardrobe';

export type WardrobeSeedCategory = 'tops' | 'bottoms' | 'accessories';

export interface WardrobeSeedItem {
  code: string;
  type: string;
  category: WardrobeSeedCategory;
  imageUrl: string;
  title: string;
  sourceUrl?: string;
}

export function wardrobeSeedToItem(s: WardrobeSeedItem): WardrobeItem {
  return {
    code: s.code,
    type: s.type,
    category: s.category,
    imageUrl: s.imageUrl,
    title: s.title,
    ...(s.sourceUrl ? { sourceUrl: s.sourceUrl } : {}),
  };
}

const u = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=80`;

/** Curated Unsplash paths — apparel laid flat or isolated (no hangers, no on-body shots). */
export const WARDROBE_TEST_ITEMS: WardrobeSeedItem[] = [
  // Tops
  {
    code: 'TT-100',
    type: 'Top',
    category: 'tops',
    title: 'Organic cotton crewneck tee — off-white',
    imageUrl: u('photo-1620799139507-2a76f79a2f4d'),
    sourceUrl: 'https://unsplash.com/photos/white-crew-neck-t-shirt-elbKS4DY21g',
  },
  {
    code: 'TT-101',
    type: 'Top',
    category: 'tops',
    title: 'Oxford cloth button-down — sky blue',
    imageUrl: u('photo-1602810316693-3667c854239a'),
    sourceUrl: 'https://unsplash.com/photos/blue-button-up-shirt-on-white-table-BKYeLLB1OxI',
  },
  {
    code: 'SW-102',
    type: 'Sweater',
    category: 'tops',
    title: 'Fisherman rib wool sweater — oatmeal',
    imageUrl: u('photo-1621198059871-0d5f9b449233'),
    sourceUrl: 'https://unsplash.com/photos/white-knit-sweater-on-white-wooden-surface-xEraWP_ZRGU',
  },
  {
    code: 'TR-103',
    type: 'Turtleneck',
    category: 'tops',
    title: 'Fine merino turtleneck — charcoal',
    imageUrl: u('photo-1618354691551-44de113f0164'),
    sourceUrl: 'https://unsplash.com/photos/black-long-sleeve-shirt-on-white-table-A7f7XRKgUWc',
  },
  {
    code: 'JK-104',
    type: 'Jacket',
    category: 'tops',
    title: 'Leather moto jacket — black',
    imageUrl: u('photo-1727515192207-3dc860bfd773'),
    sourceUrl: 'https://unsplash.com/photos/a-black-leather-jacket-laying-on-a-black-cloth-eELIrBJXBPk',
  },
  {
    code: 'JK-105',
    type: 'Jacket',
    category: 'tops',
    title: 'Raw denim trucker jacket — indigo',
    imageUrl: u('photo-1571945153237-4929e783af4a'),
    sourceUrl: 'https://unsplash.com/photos/1571945153237-4929e783af4a',
  },
  {
    code: 'CT-106',
    type: 'Coat',
    category: 'tops',
    title: 'Double-breasted wool coat — camel',
    imageUrl: u('photo-1551488831-00ddcb6c6bd3'),
    sourceUrl: 'https://unsplash.com/photos/1551488831-00ddcb6c6bd3',
  },
  {
    code: 'DR-107',
    type: 'Dress',
    category: 'tops',
    title: 'Midi slip dress — black satin',
    imageUrl: u('photo-1590874103328-eac38a683ce7'),
    sourceUrl: 'https://unsplash.com/photos/1590874103328-eac38a683ce7',
  },
  {
    code: 'DR-108',
    type: 'Dress',
    category: 'tops',
    title: 'Wrap midi dress — botanical print',
    imageUrl: u('photo-1583743814966-8936f5b7be1a'),
    sourceUrl: 'https://unsplash.com/photos/1583743814966-8936f5b7be1a',
  },
  {
    code: 'BD-109',
    type: 'Bodysuit',
    category: 'tops',
    title: 'Scoop-neck jersey bodysuit — black',
    imageUrl: u('photo-1606051600761-3753de5474e6'),
    sourceUrl: 'https://unsplash.com/photos/black-crew-neck-shirt-on-white-textile-8pz6uWwwEcQ',
  },
  {
    code: 'BR-110',
    type: 'Bra',
    category: 'tops',
    title: 'Seamless lounge bralette — taupe',
    imageUrl: u('photo-1485230895905-ec40ba36b9bc'),
    sourceUrl: 'https://unsplash.com/photos/flatlay-lingerie',
  },

  // Bottoms
  {
    code: 'PN-200',
    type: 'Pants',
    category: 'bottoms',
    title: 'High-rise straight jeans — vintage blue',
    imageUrl: u('photo-1604176354204-9268737828e4'),
    sourceUrl: 'https://unsplash.com/photos/1604176354204-9268737828e4',
  },
  {
    code: 'PN-201',
    type: 'Pants',
    category: 'bottoms',
    title: 'Pleated wool trousers — charcoal',
    imageUrl: u('photo-1473966968600-fa801b869a1a'),
    sourceUrl: 'https://unsplash.com/photos/khaki-pants',
  },
  {
    code: 'PN-202',
    type: 'Pants',
    category: 'bottoms',
    title: 'Tailored chinos — stone',
    imageUrl: u('photo-1541099649105-f69ad21f3246'),
    sourceUrl: 'https://unsplash.com/photos/blue-denim-jeans',
  },
  {
    code: 'SH-203',
    type: 'Shorts',
    category: 'bottoms',
    title: 'Linen blend shorts — sand',
    imageUrl: u('photo-1524504388940-b1c1722653e1'),
    sourceUrl: 'https://unsplash.com/photos/beige-shorts',
  },
  {
    code: 'SK-204',
    type: 'Skirt',
    category: 'bottoms',
    title: 'Pleated midi skirt — navy',
    imageUrl: u('photo-1635447272615-a414b7ea1df4'),
    sourceUrl: 'https://unsplash.com/photos/a-pair-of-black-shoes-a-black-sweater-and-a-pair-of-black-sunglasses-L4rQueW3oEQ',
  },
  {
    code: 'UW-205',
    type: 'Underwear',
    category: 'bottoms',
    title: 'High-cut briefs — cotton pack',
    imageUrl: u('photo-1515886657613-9f3515b0c78f'),
    sourceUrl: 'https://unsplash.com/photos/underwear-flatlay',
  },
  {
    code: 'LG-206',
    type: 'Leggings',
    category: 'bottoms',
    title: 'High-rise pocket leggings — black',
    imageUrl: u('photo-1529374255404-311a2a4f1fd9'),
    sourceUrl: 'https://unsplash.com/photos/white-hotel-printed-crew-neck-shirt-on-black-surface-9ugEeqflo70',
  },
  {
    code: 'PN-207',
    type: 'Pants',
    category: 'bottoms',
    title: 'Relaxed cargo pants — olive',
    imageUrl: u('photo-1544022613-e87ca75a784a'),
    sourceUrl: 'https://unsplash.com/photos/1544022613-e87ca75a784a',
  },
  {
    code: 'PN-208',
    type: 'Pants',
    category: 'bottoms',
    title: 'Wide-leg wool trousers — cream',
    imageUrl: u('photo-1715859019107-90c16285b149'),
    sourceUrl: 'https://unsplash.com/photos/a-shirt-and-a-pair-of-earrings-on-a-bed-NLBTc-0CCz8',
  },
  {
    code: 'JG-209',
    type: 'Joggers',
    category: 'bottoms',
    title: 'Tapered fleece joggers — heather grey',
    imageUrl: u('photo-1556821840-3a63f95609a7'),
    sourceUrl: 'https://unsplash.com/photos/grey-sweatpants-flatlay',
  },

  // Accessories
  {
    code: 'HT-300',
    type: 'Hat',
    category: 'accessories',
    title: 'Wool fedora — camel',
    imageUrl: u('photo-1521369909029-2afed882baee'),
    sourceUrl: 'https://unsplash.com/photos/brown-fedora-hat',
  },
  {
    code: 'SC-301',
    type: 'Scarf',
    category: 'accessories',
    title: 'Cashmere wrap scarf — rust',
    imageUrl: u('photo-1553062407-98eeb64c6a62'),
    sourceUrl: 'https://unsplash.com/photos/orange-scarf',
  },
  {
    code: 'BT-302',
    type: 'Belt',
    category: 'accessories',
    title: 'Full-grain leather belt — cognac',
    imageUrl: u('photo-1584917865442-de89df76afd3'),
    sourceUrl: 'https://unsplash.com/photos/brown-leather-belt',
  },
  {
    code: 'BG-303',
    type: 'Bag',
    category: 'accessories',
    title: 'Structured leather tote — chestnut',
    imageUrl: u('photo-1566150905458-1bf1fc113f0d'),
    sourceUrl: 'https://unsplash.com/photos/brown-leather-handbag',
  },
  {
    code: 'BG-304',
    type: 'Bag',
    category: 'accessories',
    title: 'Quilted crossbody — black',
    imageUrl: u('photo-1548036328-c9fa89d128fa'),
    sourceUrl: 'https://unsplash.com/photos/black-handbag',
  },
  {
    code: 'SG-305',
    type: 'Sunglasses',
    category: 'accessories',
    title: 'Acetate square frames — tortoise',
    imageUrl: u('photo-1511499767150-a48a237f0083'),
    sourceUrl: 'https://unsplash.com/photos/brown-sunglasses-on-white-surface',
  },
  {
    code: 'WT-306',
    type: 'Watch',
    category: 'accessories',
    title: 'Minimal steel watch — silver',
    imageUrl: u('photo-1524592094714-0f0654e20314'),
    sourceUrl: 'https://unsplash.com/photos/silver-round-chronograph-watch',
  },
  {
    code: 'NK-307',
    type: 'Necklace',
    category: 'accessories',
    title: 'Delicate gold chain — 18"',
    imageUrl: u('photo-1611591437281-460bfbe1220a'),
    sourceUrl: 'https://unsplash.com/photos/gold-chain-necklace',
  },
  {
    code: 'SK-308',
    type: 'Socks',
    category: 'accessories',
    title: 'Ribbed crew socks — oatmeal 3-pack',
    imageUrl: u('photo-1617127365659-c47fa864d8bc'),
    sourceUrl: 'https://unsplash.com/photos/1617127365659-c47fa864d8bc',
  },
  {
    code: 'SN-309',
    type: 'Shoes',
    category: 'accessories',
    title: 'Low-top leather sneakers — white',
    imageUrl: u('photo-1549298916-b41d501d3772'),
    sourceUrl: 'https://unsplash.com/photos/white-sneakers',
  },
];
