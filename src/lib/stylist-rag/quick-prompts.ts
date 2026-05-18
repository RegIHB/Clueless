import type { ProfilePreferences } from '@/lib/supabase/sync';
import type { StylistWeather } from './types';

export type QuickPrompt = {
  label: string;
  message: string;
};

export function buildQuickPrompts(
  weather: StylistWeather,
  prefs: ProfilePreferences | null | undefined
): QuickPrompt[] {
  const temp = weather.temp;
  const vibe = prefs?.styleVibe && prefs.styleVibe !== 'no-preference' ? prefs.styleVibe : null;

  const prompts: QuickPrompt[] = [];

  if (temp < 12) {
    prompts.push({
      label: 'Stay warm',
      message: `It's ${temp}°C and ${weather.condition} — layer me up for the day using my wardrobe.`,
    });
  } else if (temp > 24) {
    prompts.push({
      label: 'Beat the heat',
      message: `Hot day at ${temp}°C — light, breathable outfit from my closet please.`,
    });
  }

  prompts.push(
    { label: 'Work look', message: 'Smart outfit for work today from my wardrobe.' },
    { label: 'Date night', message: 'Date night outfit — polished but comfortable, from what I own.' },
    { label: 'Casual day', message: 'Relaxed casual look for errands and coffee.' },
  );

  if (vibe === 'minimal') {
    prompts.push({
      label: 'Clean & minimal',
      message: 'Minimal, clean outfit — few pieces, neutral tones from my closet.',
    });
  } else if (vibe === 'streetwear') {
    prompts.push({
      label: 'Street vibe',
      message: 'Streetwear-inspired fit using my wardrobe.',
    });
  } else if (vibe === 'romantic') {
    prompts.push({
      label: 'Soft & romantic',
      message: 'Soft romantic look with pieces I already own.',
    });
  }

  const seen = new Set<string>();
  return prompts.filter((p) => {
    if (seen.has(p.label)) return false;
    seen.add(p.label);
    return true;
  }).slice(0, 6);
}

export const REFINE_PROMPTS: QuickPrompt[] = [
  { label: 'More formal', message: 'Make it more formal while keeping my style DNA.' },
  { label: 'More casual', message: 'Dial it back — more casual and comfortable.' },
  { label: 'Warmer layers', message: 'Add warmer layers from my wardrobe.' },
  { label: 'Different colours', message: 'Suggest a different colour combo from my closet.' },
];
