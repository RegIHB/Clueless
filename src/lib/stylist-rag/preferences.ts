import type { ProfilePreferences } from '@/lib/supabase/sync';

const VIBE_EXPANSIONS: Record<string, string[]> = {
  minimal: ['minimal', 'clean', 'simple', 'sleek', 'neutral', 'streamlined', 'understated'],
  classic: ['classic', 'timeless', 'tailored', 'blazer', 'button', 'elegant', 'polished', 'refined'],
  streetwear: ['streetwear', 'street', 'sneakers', 'hoodie', 'cargo', 'oversized', 'urban', 'casual'],
  romantic: ['romantic', 'soft', 'feminine', 'dress', 'floral', 'delicate', 'flowy', 'satin', 'lace'],
  experimental: ['experimental', 'bold', 'avant', 'statement', 'unique', 'creative', 'unexpected'],
};

const PALETTE_EXPANSIONS: Record<string, string[]> = {
  neutrals: ['neutral', 'beige', 'cream', 'white', 'grey', 'gray', 'black', 'navy', 'tan'],
  'dark-tones': ['dark', 'black', 'navy', 'charcoal', 'burgundy', 'forest', 'deep'],
  'bright-colours': ['bright', 'vivid', 'colorful', 'colourful', 'red', 'yellow', 'orange', 'pink', 'blue'],
  pastels: ['pastel', 'soft', 'lavender', 'mint', 'blush', 'light'],
  'earth-tones': ['earth', 'brown', 'olive', 'rust', 'terracotta', 'khaki', 'camel', 'sand'],
};

export function preferenceKeywords(prefs: ProfilePreferences | null | undefined): string[] {
  if (!prefs) return [];
  const words: string[] = [];
  const vibe = prefs.styleVibe?.trim();
  if (vibe && vibe !== 'no-preference') {
    words.push(vibe, ...(VIBE_EXPANSIONS[vibe] ?? []));
  }
  const palette = prefs.colorPalette?.trim();
  if (palette && palette !== 'no-preference') {
    words.push(palette.replace(/-/g, ' '), ...(PALETTE_EXPANSIONS[palette] ?? []));
  }
  if (prefs.notes?.trim()) {
    words.push(...prefs.notes.trim().split(/\s+/).slice(0, 40));
  }
  return words;
}

export function formatPreferenceProfile(prefs: ProfilePreferences | null | undefined): string {
  if (!prefs) return 'No saved style DNA yet — infer taste from the conversation and wardrobe.';

  const lines: string[] = [];
  if (prefs.styleVibe && prefs.styleVibe !== 'no-preference') {
    lines.push(`Preferred vibe: ${prefs.styleVibe} (${(VIBE_EXPANSIONS[prefs.styleVibe] ?? []).slice(0, 5).join(', ')})`);
  }
  if (prefs.colorPalette && prefs.colorPalette !== 'no-preference') {
    const label = prefs.colorPalette.replace(/-/g, ' ');
    lines.push(`Colour palette: ${label}`);
  }
  if (prefs.notes?.trim()) {
    lines.push(`Personal notes: ${prefs.notes.trim()}`);
  }
  if (lines.length === 0) {
    return 'Style DNA saved but open — follow what they ask for in the moment.';
  }
  return lines.join('\n');
}

export function preferenceSummaryShort(prefs: ProfilePreferences | null | undefined): string | null {
  if (!prefs) return null;
  const parts: string[] = [];
  if (prefs.styleVibe && prefs.styleVibe !== 'no-preference') {
    parts.push(prefs.styleVibe.replace(/-/g, ' '));
  }
  if (prefs.colorPalette && prefs.colorPalette !== 'no-preference') {
    parts.push(prefs.colorPalette.replace(/-/g, ' '));
  }
  if (parts.length === 0 && !prefs.notes?.trim()) return null;
  if (prefs.notes?.trim()) parts.push('your notes');
  return parts.join(' · ');
}
