export type OutfitSuggestion = {
  tops: string[];
  bottoms: string[];
  accessories: string[];
  reason: string;
};

export function buildFallbackSuggestion(userPrompt: string, temp: number, condition: string): OutfitSuggestion {
  const hasWork = userPrompt.toLowerCase().includes("work");
  const hasDate = userPrompt.toLowerCase().includes("date");
  const isCold = temp < 15;
  const isRaining = condition.toLowerCase().includes("rain");

  if (hasWork && hasDate) {
    return {
      tops: ["TT-04", "TS-04", "WJ-02"],
      bottoms: ["BD-04", "LG-13"],
      accessories: ["AC-03"],
      reason: `For work-to-date transition, start with a ${isCold ? "turtleneck" : "top"} and structured pants. ${isRaining ? "Add water-resistant outerwear or an umbrella." : "Keep accessories minimal for flexibility."}`,
    };
  }

  if (hasWork) {
    return {
      tops: ["TS-04", "TT-04"],
      bottoms: ["BD-04", "LG-14"],
      accessories: ["AC-03"],
      reason: `Professional and clean styling for work. ${isCold ? "Layer with WJ-02 for warmth." : "Use lighter fabrics for comfort."}`,
    };
  }

  if (hasDate) {
    return {
      tops: ["BD-03", "TT-02", "LS-04"],
      bottoms: ["SK-08", "LG-13"],
      accessories: ["AC-02", "AC-04"],
      reason: `Date-night ready outfit with balanced style and comfort. ${isCold ? "Add a knit layer." : "A lighter top keeps the look relaxed."}`,
    };
  }

  return {
    tops: ["TT-04", "BD-03"],
    bottoms: ["SH-06", "BD-04"],
    accessories: ["AC-01"],
    reason: "Casual and comfortable look for everyday plans.",
  };
}
