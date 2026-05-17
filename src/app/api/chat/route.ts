import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { buildFallbackSuggestion } from "@/lib/outfit-fallback";
import { wantsOutfitRecommendation } from "@/lib/outfit-intent";
import { requireAuth } from "@/app/api/_helpers/auth";
import { rateLimit } from "@/app/api/_helpers/rate-limit";
import type { WardrobeItem } from "@/types/wardrobe";

const wardrobeItemSchema = z.object({
  code: z.string().min(1).max(120),
  type: z.string().min(1).max(120),
  category: z.enum(["tops", "bottoms", "accessories"]),
  title: z.string().max(500).optional(),
});

const requestSchema = z.object({
  message: z.string().min(1),
  location: z.string().default("Berlin"),
  weather: z.object({
    temp: z.number().default(12),
    condition: z.string().default("Cloudy"),
  }),
  wardrobeItems: z.array(wardrobeItemSchema).max(120).optional().default([]),
});

type ProviderResult = { reply: string };

type StylePrefs = { styleVibe?: string; colorPalette?: string; notes?: string };

function formatStylePrefs(prefs: StylePrefs | null | undefined): string {
  if (!prefs) return '';
  const parts: string[] = [];
  if (prefs.styleVibe && prefs.styleVibe !== 'no-preference') parts.push(`style vibe: ${prefs.styleVibe}`);
  if (prefs.colorPalette && prefs.colorPalette !== 'no-preference') parts.push(`colour palette: ${prefs.colorPalette}`);
  if (prefs.notes) parts.push(`notes: ${prefs.notes}`);
  if (parts.length === 0) return '';
  return `The user's style preferences: ${parts.join('; ')}. Use these to personalise every response.\n\n`;
}

function stylistSystemPrompt(outfitMode: boolean, stylePrefs: StylePrefs | null | undefined): string {
  const prefsBlock = formatStylePrefs(stylePrefs);
  if (outfitMode) {
    return `${prefsBlock}You are an AI fashion stylist. The user wants outfit help. Recommend only from the wardrobe items provided in the prompt; do not invent garments or item codes. Give concise, practical advice for their plans and the weather. No markdown headings.`;
  }
  return `${prefsBlock}You are a friendly AI fashion stylist chatting with the user. They are NOT asking for a full outfit yet (greeting, small talk, or general question). Reply warmly and briefly—one or two short paragraphs max. Do NOT list specific garments, SKUs, or a full outfit. If it fits naturally, invite them to share their plans or occasion when they want concrete suggestions. No markdown headings.`;
}

function wardrobePromptSummary(items: WardrobeItem[]): string {
  if (items.length === 0) return "No wardrobe items are available yet.";
  return items
    .slice(0, 80)
    .map((item) => {
      const title = item.title ? ` — ${item.title}` : "";
      return `${item.code} | ${item.category} | ${item.type}${title}`;
    })
    .join("\n");
}

async function callOpenAI(prompt: string, outfitMode: boolean, stylePrefs: StylePrefs | null): Promise<ProviderResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: stylistSystemPrompt(outfitMode, stylePrefs),
      },
      { role: "user", content: prompt },
    ],
    max_completion_tokens: 500,
  });

  const reply = completion.choices[0]?.message?.content?.trim();
  if (!reply) throw new Error("OpenAI response empty");
  return { reply };
}

function resolveAiProvider(): "openai" | "gemini" {
  const explicit = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (explicit === "openai" || explicit === "gemini") return explicit;
  // If only one key is set, use that provider (typical for Gemini free tier via AI Studio).
  if (process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY) return "openai";
  return "openai";
}

async function callGemini(prompt: string, outfitMode: boolean, stylePrefs: StylePrefs | null): Promise<ProviderResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  // Free-tier friendly default; override with GEMINI_MODEL (e.g. gemini-2.5-flash).
  const modelId = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: modelId });
  const fullPrompt = `${stylistSystemPrompt(outfitMode, stylePrefs)}\n\n${prompt}`;
  const result = await model.generateContent(fullPrompt);
  const reply = result.response.text().trim();
  if (!reply) throw new Error("Gemini response empty");
  return { reply };
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (ctx instanceof NextResponse) return ctx;
    const limited = rateLimit({
      scope: "api:chat",
      subject: ctx.userId,
      limit: 30,
      windowMs: 10 * 60 * 1000,
    });
    if (limited) return limited;

    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { message, location, weather, wardrobeItems } = parsed.data;
    const outfitMode = wantsOutfitRecommendation(message);
    const fallback = buildFallbackSuggestion(message, weather.temp, weather.condition, wardrobeItems);

    let stylePrefs: StylePrefs | null = null;
    try {
      const { data } = await ctx.supabase
        .from('profiles')
        .select('style_preferences')
        .eq('id', ctx.userId)
        .maybeSingle();
      if (data?.style_preferences) stylePrefs = data.style_preferences as StylePrefs;
    } catch { /* non-breaking: fall back to no preferences */ }

    const prompt = [
      `User location: ${location}.`,
      `Weather: ${weather.temp}C and ${weather.condition}.`,
      `Available wardrobe items:\n${wardrobePromptSummary(wardrobeItems)}`,
      `User message: ${message}`,
      outfitMode
        ? "Give concise recommendations with practical reasoning. Mention item names or codes only from the available wardrobe list."
        : "Respond conversationally only—no outfit rundown unless they ask.",
    ].join("\n");

    let reply: string | null = null;
    const providerPreference = resolveAiProvider();

    const tryOpenAI = async () => {
      try {
        reply = (await callOpenAI(prompt, outfitMode, stylePrefs)).reply;
      } catch (err) {
        console.error("[chat] OpenAI failed:", err);
      }
    };
    const tryGemini = async () => {
      try {
        reply = (await callGemini(prompt, outfitMode, stylePrefs)).reply;
      } catch (err) {
        console.error("[chat] Gemini failed:", err);
      }
    };

    if (providerPreference === "gemini") {
      await tryGemini();
      if (!reply) await tryOpenAI();
    } else {
      await tryOpenAI();
      if (!reply) await tryGemini();
    }

    const trimmedReply = (reply ?? "").trim();
    const usedRuleBased = !trimmedReply;

    const replyText = usedRuleBased
      ? outfitMode
        ? `${fallback.reason} The picks below match your plans and the weather.`
        : `Hey! When you’re ready, tell me what you’re doing today or the vibe you want—I’ll pull ideas from your wardrobe. It’s ${weather.temp}°C and ${weather.condition} in ${location} right now.`
      : trimmedReply;

    return NextResponse.json({
      reply: replyText,
      outfitSuggestion: outfitMode ? fallback : null,
      ...(usedRuleBased ? { stylistMode: "rules" as const } : {}),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Chat service failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
