/** Keys are scoped by user id so each account has its own closet (same pattern as Clueless). */
function storageKey(userId: string, base: string) {
  return `clueless-${base}-${userId}`;
}

function isWardrobeRow(x: unknown): x is import('@/types/wardrobe').WardrobeItem {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.code === 'string' &&
    typeof o.type === 'string' &&
    (o.category === 'tops' || o.category === 'bottoms' || o.category === 'accessories')
  );
}

export type WardrobeStorageState =
  | { kind: 'none' }
  | { kind: 'empty' }
  | { kind: 'items'; items: import('@/types/wardrobe').WardrobeItem[] };

/** Whether the user has ever persisted wardrobe to this device (including an intentional empty closet). */
export function getWardrobeStorageState(userId: string | null): WardrobeStorageState {
  if (!userId || typeof window === 'undefined') return { kind: 'none' };
  const k = storageKey(userId, 'wardrobe');
  const raw = localStorage.getItem(k);
  if (raw === null) return { kind: 'none' };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return { kind: 'none' };
    const items = parsed.filter(isWardrobeRow);
    if (items.length === 0) return { kind: 'empty' };
    return { kind: 'items', items };
  } catch {
    return { kind: 'none' };
  }
}

function safeSet(storageKeyName: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKeyName, JSON.stringify(value));
  } catch {
    // quota or unsupported
  }
}

export type WardrobeItem = import('@/types/wardrobe').WardrobeItem;

export const storage = {
  getWardrobe: (userId: string | null): WardrobeItem[] => {
    const s = getWardrobeStorageState(userId);
    if (s.kind === 'items') return s.items;
    return [];
  },

  setWardrobe: (userId: string | null, items: WardrobeItem[]) => {
    if (userId) safeSet(storageKey(userId, 'wardrobe'), items);
  },
};
