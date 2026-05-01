/**
 * Whether the user message is asking for concrete outfit / wardrobe help
 * (vs greetings, thanks, or general chat).
 */
export function wantsOutfitRecommendation(message: string): boolean {
  const t = message.trim();
  if (!t) return false;
  const lower = t.toLowerCase();

  const chitChat =
    /^(hi|hello|hey|yo|sup|hiya|howdy|thanks|thank you|thx|ty|ok+|okay|k\.?|bye|goodbye|cool|nice|great|lol|haha|yep|yes|no|nope|sure|awesome)\.?$/i;
  if (chitChat.test(t)) return false;

  const casualCheckIn =
    /^(what'?s up|how are you|how'?re you|how is it going|how's it going|good (morning|afternoon|evening)|gm|gn)\??$/i;
  if (t.length < 40 && casualCheckIn.test(t)) return false;

  if (/^(what can you|how do (i|you) use|who are you|what is this)\b/i.test(t)) return false;

  const wordSignals =
    /\b(wear|outfit|outfits|clothes|clothing|dress|styled|wardrobe|layer|jacket|coat|blazer|sneakers|boots|heels|bag|accessor|work|office|meeting|interview|date|dinner|party|wedding|gym|casual|formal|brunch|trip|travel|event|occasion|errands|concert|drinks|presentation|recommend|suggest)\b/i;
  if (wordSignals.test(lower)) return true;

  const phraseSignals = [
    "what should i",
    "what do i wear",
    "what to wear",
    "help me pick",
    "help me choose",
    "going out",
    "going to",
    "pick an outfit",
    "put together",
    "running around",
    "good for",
    "appropriate for",
    "weather",
    "cold",
    "hot",
    "rain",
    "snow",
    "today",
    "tonight",
    "tomorrow",
  ];

  if (phraseSignals.some((s) => lower.includes(s))) return true;

  if (t.length >= 52) return true;

  return false;
}
