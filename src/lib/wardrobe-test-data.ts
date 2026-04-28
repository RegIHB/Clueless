/**
 * Demo wardrobe inventory: realistic garment titles with stock photos (Unsplash).
 * Safe to replace or clear in production when persisting real user data.
 */

export type WardrobeSeedCategory = 'tops' | 'bottoms' | 'accessories';

export interface WardrobeSeedItem {
  code: string;
  type: string;
  category: WardrobeSeedCategory;
  imageUrl: string;
  title: string;
  sourceUrl?: string;
}

const u = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=80`;

/** Curated Unsplash paths (photo id + optional ixlib/sig for stable crops). */
export const WARDROBE_TEST_ITEMS: WardrobeSeedItem[] = [
  // Tops
  {
    code: 'TT-100',
    type: 'Top',
    category: 'tops',
    title: 'Organic cotton crewneck tee — off-white',
    imageUrl: u('photo-1576566588028-4147f3842f27'),
    sourceUrl: 'https://unsplash.com/photos/blank-white-t-shirt-hanging-on-hanger',
  },
  {
    code: 'TT-101',
    type: 'Top',
    category: 'tops',
    title: 'Oxford cloth button-down — sky blue',
    imageUrl: u('photo-1602810318383-e386cc2a3ccf'),
    sourceUrl: 'https://unsplash.com/photos/blue-dress-shirt',
  },
  {
    code: 'SW-102',
    type: 'Sweater',
    category: 'tops',
    title: 'Fisherman rib wool sweater — oatmeal',
    imageUrl: u('photo-1434389677669-e08b4cac3105'),
    sourceUrl: 'https://unsplash.com/photos/woman-in-white-sweater',
  },
  {
    code: 'TR-103',
    type: 'Turtleneck',
    category: 'tops',
    title: 'Fine merino turtleneck — charcoal',
    imageUrl: u('photo-1521572163474-6864f9cf17ab'),
    sourceUrl: 'https://unsplash.com/photos/person-wearing-black-turtleneck',
  },
  {
    code: 'JK-104',
    type: 'Jacket',
    category: 'tops',
    title: 'Leather moto jacket — black',
    imageUrl: u('photo-1551028719-00167b16eac5'),
    sourceUrl: 'https://unsplash.com/photos/black-leather-jacket',
  },
  {
    code: 'JK-105',
    type: 'Jacket',
    category: 'tops',
    title: 'Raw denim trucker jacket — indigo',
    imageUrl: u('photo-1542272604-787c3835535d'),
    sourceUrl: 'https://unsplash.com/photos/person-wearing-blue-denim-jacket',
  },
  {
    code: 'CT-106',
    type: 'Coat',
    category: 'tops',
    title: 'Double-breasted wool coat — camel',
    imageUrl: u('photo-1539533018447-63fcce2678e3'),
    sourceUrl: 'https://unsplash.com/photos/woman-wearing-brown-coat',
  },
  {
    code: 'DR-107',
    type: 'Dress',
    category: 'tops',
    title: 'Midi slip dress — black satin',
    imageUrl: u('photo-1496747611176-843222e1e57c'),
    sourceUrl: 'https://unsplash.com/photos/woman-wearing-black-dress-standing',
  },
  {
    code: 'DR-108',
    type: 'Dress',
    category: 'tops',
    title: 'Wrap midi dress — botanical print',
    imageUrl: u('photo-1595777457583-95e059d581b8'),
    sourceUrl: 'https://unsplash.com/photos/woman-wearing-white-and-green-dress',
  },
  {
    code: 'BD-109',
    type: 'Bodysuit',
    category: 'tops',
    title: 'Scoop-neck jersey bodysuit — black',
    imageUrl: u('photo-1469334031218-e382a71b716b'),
    sourceUrl: 'https://unsplash.com/photos/woman-wearing-black-scoop-neck-shirt',
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
    imageUrl: u('photo-1541099649105-f69ad21f3246'),
    sourceUrl: 'https://unsplash.com/photos/blue-denim-jeans',
  },
  {
    code: 'PN-201',
    type: 'Pants',
    category: 'bottoms',
    title: 'Pleated wool trousers — charcoal',
    imageUrl: u('photo-1594938298603-c8148c4dae35'),
    sourceUrl: 'https://unsplash.com/photos/person-wearing-black-pants',
  },
  {
    code: 'PN-202',
    type: 'Pants',
    category: 'bottoms',
    title: 'Tailored chinos — stone',
    imageUrl: u('photo-1473966968600-fa801b869a1a'),
    sourceUrl: 'https://unsplash.com/photos/khaki-pants',
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
    imageUrl: u('photo-1469334031218-e382a71b716b'),
    sourceUrl: 'https://unsplash.com/photos/woman-wearing-blue-skirt',
  },
  {
    code: 'UW-205',
    type: 'Underwear',
    category: 'bottoms',
    title: 'High-cut briefs — cotton pack',
    imageUrl: u('photo-1515886657613-9f3515b0c78f'),
    sourceUrl: 'https://unsplash.com/photos/underwear-flatlay',
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
];
