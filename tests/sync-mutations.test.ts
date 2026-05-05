import { describe, expect, test, vi } from 'vitest';
import type { WardrobeItem } from '@/types/wardrobe';
import { rowToSavedOutfit, rowToWardrobeItem, slimWardrobeSnapshot, wardrobeItemToInsertRow } from '@/lib/supabase/sync/mappers';

describe('sync mappers', () => {
  test('rowToWardrobeItem maps client_item_id to code', () => {
    const item = rowToWardrobeItem({
      id: 'db-id',
      user_id: 'u',
      client_item_id: 'TP-123',
      type: 'Shirt',
      category: 'tops',
      image_url: 'https://example/img.jpg',
      title: 'Tee',
      source_url: null,
      attribution: null,
      sort_order: 0,
      version: 1,
      deleted_at: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-02',
    });
    expect(item.code).toBe('TP-123');
    expect(item.imageUrl).toBe('https://example/img.jpg');
  });

  test('slimWardrobeSnapshot drops data: URLs and oversized URLs', () => {
    const item: WardrobeItem = {
      code: 'TP-1',
      type: 'Shirt',
      category: 'tops',
      imageUrl: 'data:image/png;base64,AAAA',
    };
    expect(slimWardrobeSnapshot(item)?.imageUrl).toBeUndefined();

    const big: WardrobeItem = {
      code: 'TP-2',
      type: 'Coat',
      category: 'tops',
      imageUrl: 'https://e/' + 'x'.repeat(5000),
    };
    expect(slimWardrobeSnapshot(big)?.imageUrl).toBeUndefined();

    const ok: WardrobeItem = {
      code: 'TP-3',
      type: 'Shirt',
      category: 'tops',
      imageUrl: 'https://example/img.jpg',
    };
    expect(slimWardrobeSnapshot(ok)?.imageUrl).toBe('https://example/img.jpg');
  });

  test('wardrobeItemToInsertRow truncates oversized text fields', () => {
    const item: WardrobeItem = {
      code: 'TP-4',
      type: 'Shirt',
      category: 'tops',
      sourceUrl: 'https://e/' + 'x'.repeat(20000),
      title: 'a'.repeat(2000),
      attribution: 'b'.repeat(2000),
    };
    const row = wardrobeItemToInsertRow('user-1', item, 5);
    expect(row.user_id).toBe('user-1');
    expect(row.client_item_id).toBe('TP-4');
    expect(row.sort_order).toBe(5);
    expect(row.source_url?.length ?? 0).toBeLessThanOrEqual(8000);
    expect(row.title?.length ?? 0).toBeLessThanOrEqual(500);
    expect(row.attribution?.length ?? 0).toBeLessThanOrEqual(500);
  });

  test('rowToSavedOutfit preserves snapshot data and parses saved_at', () => {
    const outfit = rowToSavedOutfit({
      id: 'o1',
      user_id: 'u',
      client_outfit_id: 'co-1',
      tops_client_item_id: 'TP-1',
      bottoms_client_item_id: null,
      accessories_client_item_id: null,
      snapshot: { tops: { code: 'TP-1', type: 'Shirt', category: 'tops' } },
      version: 1,
      deleted_at: null,
      saved_at: '2026-05-05T19:00:00.000Z',
      created_at: '2026-05-05',
      updated_at: '2026-05-05',
    });
    expect(outfit.id).toBe('o1');
    expect(outfit.tops?.code).toBe('TP-1');
    expect(outfit.savedAt.getTime()).toBe(new Date('2026-05-05T19:00:00.000Z').getTime());
  });
});

describe('client mutation idempotency', () => {
  test('upsertWardrobeItem returns existing log entry without re-inserting', async () => {
    const findMock = vi.fn().mockResolvedValue({
      data: { result_kind: 'wardrobe_upsert', result_id: 'existing-id' },
      error: null,
    });
    const upsertMock = vi.fn();

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'client_mutation_log') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: findMock,
                }),
              }),
            }),
            insert: () => ({ select: () => ({ maybeSingle: vi.fn() }) }),
          };
        }
        return {
          upsert: upsertMock,
        };
      }),
    };

    const { upsertWardrobeItem } = await import('@/lib/supabase/sync/mutations');
    const result = await upsertWardrobeItem(
      // @ts-expect-error mock
      supabase,
      'user-1',
      { code: 'TP-1', type: 'Shirt', category: 'tops' },
      0,
      'mutation-1'
    );
    expect(result.ok).toBe(true);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe('sync feature flags', () => {
  test('readFromV2 defaults true; can be disabled via NEXT_PUBLIC_SYNC_READ_V2=0', async () => {
    const original = process.env.NEXT_PUBLIC_SYNC_READ_V2;
    try {
      delete process.env.NEXT_PUBLIC_SYNC_READ_V2;
      vi.resetModules();
      const flagsDefault = await import('@/lib/supabase/sync-feature-flags');
      expect(flagsDefault.readFromV2()).toBe(true);

      process.env.NEXT_PUBLIC_SYNC_READ_V2 = '0';
      vi.resetModules();
      const flagsOff = await import('@/lib/supabase/sync-feature-flags');
      expect(flagsOff.readFromV2()).toBe(false);
    } finally {
      if (original === undefined) delete process.env.NEXT_PUBLIC_SYNC_READ_V2;
      else process.env.NEXT_PUBLIC_SYNC_READ_V2 = original;
    }
  });
});
