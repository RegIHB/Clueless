import type { OutfitSuggestion } from '@/lib/outfit-fallback';
import type { ProfilePreferences } from '@/lib/supabase/sync';
import { formatPreferenceProfile } from './preferences';
import type { ChatTurn, RagRetrievalResult, StylistWeather } from './types';

function formatRetrievedItems(rag: RagRetrievalResult): string {
  if (rag.items.length === 0) {
    return 'No wardrobe items matched this request yet. Encourage adding pieces to their closet.';
  }
  return rag.items
    .map((r) => {
      const title = r.item.title ? ` — ${r.item.title}` : '';
      const why = r.reasons.length ? ` [${r.reasons.join(', ')}]` : '';
      return `${r.item.code} | ${r.item.category} | ${r.item.type}${title}${why}`;
    })
    .join('\n');
}

export function buildRagUserPrompt(params: {
  message: string;
  location: string;
  weather: StylistWeather;
  rag: RagRetrievalResult;
  outfitMode: boolean;
  history: ChatTurn[];
}): string {
  const { message, location, weather, rag, outfitMode, history } = params;
  const historyBlock =
    history.length > 0
      ? `Recent conversation:\n${history
          .slice(-8)
          .map((t) => `${t.role === 'user' ? 'User' : 'Stylist'}: ${t.content}`)
          .join('\n')}\n\n`
      : '';

  const occasionLine =
    rag.occasionHints.length > 0
      ? `Detected context: ${rag.occasionHints.join(', ')}.\n`
      : '';

  return [
    historyBlock,
    `User location: ${location}.`,
    `Weather: ${weather.temp}°C, ${weather.condition}.`,
    occasionLine,
    `Style DNA (always honour this):\n${rag.preferenceSummary}`,
    `\nRetrieved wardrobe (ONLY recommend from this list — these were ranked for relevance):\n${formatRetrievedItems(rag)}`,
    `\nUser message: ${message}`,
    outfitMode
      ? 'Give a concise, personalised outfit recommendation using ONLY codes from the retrieved list. Explain why each piece fits their plans, weather, and style DNA. Mention item codes in parentheses when referencing pieces.'
      : 'Reply conversationally in 1–2 short paragraphs. Do not list a full outfit unless they asked. Reference their style DNA naturally if relevant.',
  ].join('\n');
}

export function stylistSystemPrompt(
  outfitMode: boolean,
  prefs: ProfilePreferences | null | undefined
): string {
  const prefsBlock = formatPreferenceProfile(prefs);
  const base = `You are Clueless, an expert AI fashion stylist with access to the user's real wardrobe via retrieval-augmented context.

Style DNA (decision rules — never ignore):
${prefsBlock}

Rules:
- Only recommend garments from the retrieved wardrobe list; never invent SKUs or codes.
- Prioritise the user's style DNA over generic trends.
- Be warm, direct, and actionable — no markdown headings or bullet walls.
- If they mention constraints in notes (e.g. no heels), respect them strictly.`;

  if (outfitMode) {
    return `${base}
- They want outfit help: suggest a coherent look from retrieved pieces, explain layering for weather, and tie choices to their vibe/colours.`;
  }
  return `${base}
- They are chatting or asking a general question: keep it brief (1–2 paragraphs), no full outfit breakdown unless they ask.`;
}

export function outfitSuggestionFromRag(rag: RagRetrievalResult, reasonPrefix: string): OutfitSuggestion {
  const codes = (cat: keyof typeof rag.byCategory) =>
    (rag.byCategory[cat] ?? []).map((r) => r.item.code);

  const tops = codes('tops');
  const bottoms = codes('bottoms');
  const outerwear = codes('outerwear');
  const footwear = codes('footwear');
  const accessories = codes('accessories');

  const topNames = (rag.byCategory.tops ?? []).slice(0, 2).map((r) => r.item.title || r.item.type);
  const occasion = rag.occasionHints.length ? rag.occasionHints.join(' & ') : 'your plans';

  const reason =
    tops.length > 0 || bottoms.length > 0
      ? `${reasonPrefix} Built for ${occasion} using your closest wardrobe matches${topNames.length ? ` — starting with ${topNames.join(' and ')}` : ''}.`
      : `${reasonPrefix} Add a few items to your wardrobe and I can pull personalised looks from what you own.`;

  return { tops, bottoms, outerwear, footwear, accessories, reason };
}
