const garmentImageByType: Record<string, string> = {
  Top: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=80",
  Dress: "https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=800&q=80",
  Turtleneck: "https://images.unsplash.com/photo-1618677603286-0ec56cb6e1b9?auto=format&fit=crop&w=800&q=80",
  Sweater: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&w=800&q=80",
  Jacket: "https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=800&q=80",
  Coat: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=80",
  Bodysuit: "https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?auto=format&fit=crop&w=800&q=80",
  Pants: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=800&q=80",
  Shorts: "https://images.unsplash.com/photo-1506629905607-d9f9a12653c1?auto=format&fit=crop&w=800&q=80",
  Skirt: "https://images.unsplash.com/photo-1583496661160-fb5886a13d77?auto=format&fit=crop&w=800&q=80",
  Hat: "https://images.unsplash.com/photo-1521369909029-2afed882baee?auto=format&fit=crop&w=800&q=80",
  Scarf: "https://images.unsplash.com/photo-1548883354-94bcfe321cbb?auto=format&fit=crop&w=800&q=80",
  Belt: "https://images.unsplash.com/photo-1618677603286-0ec56cb6e1b9?auto=format&fit=crop&w=800&q=80",
  Bag: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=800&q=80",
};

export function getGarmentImage(type?: string): string {
  if (!type) {
    return "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=80";
  }
  return garmentImageByType[type] ?? "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=80";
}
