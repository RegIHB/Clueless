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
      tops: ["TT-101", "DR-107", "CT-106"],
      bottoms: ["PN-201", "SK-204"],
      accessories: ["BG-303"],
      reason: `For work-to-date transition, start with a ${isCold ? "turtleneck" : "top"} and structured pants. ${isRaining ? "Add water-resistant outerwear or an umbrella." : "Keep accessories minimal for flexibility."}`,
    };
  }

  if (hasWork) {
    return {
      tops: ["TT-101", "TR-103", "JK-105"],
      bottoms: ["PN-201", "PN-202"],
      accessories: ["BT-302"],
      reason: `Professional and clean styling for work. ${isCold ? "Layer with WJ-02 for warmth." : "Use lighter fabrics for comfort."}`,
    };
  }

  if (hasDate) {
    return {
      tops: ["DR-107", "DR-108", "TT-101"],
      bottoms: ["SK-204", "PN-201"],
      accessories: ["BT-302", "BG-303"],
      reason: `Date-night ready outfit with balanced style and comfort. ${isCold ? "Add a knit layer." : "A lighter top keeps the look relaxed."}`,
    };
  }

  return {
    tops: ["TT-100", "SW-102"],
    bottoms: ["SH-203", "PN-200"],
    accessories: ["HT-300"],
    reason: "Casual and comfortable look for everyday plans.",
  };
}
