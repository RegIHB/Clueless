import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { buildFallbackSuggestion } from "@/lib/outfit-fallback";
import { wantsOutfitRecommendation } from "@/lib/outfit-intent";
import { requireAuth } from "@/app/api/_helpers/auth";
import { rateLimit } from "@/app/api/_helpers/rate-limit";
import type { WardrobeItem } from "@/types/wardrobe";
import type { ProfilePreferences } from "@/lib/supabase/sync";
import {
  buildRagUserPrompt,
  outfitSuggestionFromRag,
  retrieveWardrobeContextWithFallback,
  stylistSystemPrompt,
  type ChatTurn,
} from "@/lib/stylist-rag";

const wardrobeItemSchema = z.object({
  code: z.string().min(1).max(120),
  type: z.string().min(1).max(120),
  category: z.enum(["tops", "bottoms", "outerwear", "footwear", "accessories"]),
  title: z.string().max(500).optional(),
});

const historyTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const requestSchema = z.object({
  message: z.string().min(1).max(2000),
  location: z.string().default("Berlin"),
  weather: z.object({
    temp: z.number().default(12),
    condition: z.string().default("Cloudy"),
  }),
  wardrobeItems: z.array(wardrobeItemSchema).max(120).optional().default([]),
  history: z.array(historyTurnSchema).max(20).optional().default([]),
});

type ProviderResult = { reply: string };

async function callOpenAI(
  system: string,
  userPrompt: string,
  history: ChatTurn[]
): Promise<ProviderResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const client = new OpenAI({ apiKey });

  const historyMessages = history.slice(-6).map((t) => ({
    role: t.role as "user" | "assistant",
    content: t.content,
  }));

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      ...historyMessages,
      { role: "user", content: userPrompt },
    ],
    max_completion_tokens: 600,
    temperature: 0.65,
  });

  const reply = completion.choices[0]?.message?.content?.trim();
  if (!reply) throw new Error("OpenAI response empty");
  return { reply };
}

function resolveAiProvider(): "openai" | "gemini" {
  const explicit = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (explicit === "openai" || explicit === "gemini") return explicit;
  if (process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY) return "openai";
  return "openai";
}

async function callGemini(
  system: string,
  userPrompt: string,
  history: ChatTurn[]
): Promise<ProviderResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const modelId = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: modelId });

  const historyText =
    history.length > 0
      ? `${history
          .slice(-6)
          .map((t) => `${t.role === "user" ? "User" : "Stylist"}: ${t.content}`)
          .join("\n")}\n\n`
      : "";

  const fullPrompt = `${system}\n\n${historyText}${userPrompt}`;
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
      limit: 40,
      windowMs: 10 * 60 * 1000,
    });
    if (limited) return limited;

    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { message, location, weather, wardrobeItems, history } = parsed.data;
    const outfitMode = wantsOutfitRecommendation(message);
    const wardrobe = wardrobeItems as WardrobeItem[];

    let stylePrefs: ProfilePreferences | null = null;
    try {
      const { data } = await ctx.supabase
        .from("profiles")
        .select("style_preferences")
        .eq("id", ctx.userId)
        .maybeSingle();
      if (data?.style_preferences) stylePrefs = data.style_preferences as ProfilePreferences;
    } catch {
      /* non-breaking */
    }

    const rag = retrieveWardrobeContextWithFallback(
      message,
      wardrobe,
      stylePrefs,
      weather,
      location,
      history as ChatTurn[]
    );

    const system = stylistSystemPrompt(outfitMode, stylePrefs);
    const userPrompt = buildRagUserPrompt({
      message,
      location,
      weather,
      rag,
      outfitMode,
      history: history as ChatTurn[],
    });

    const ruleFallback = buildFallbackSuggestion(message, weather.temp, weather.condition, wardrobe);
    const ragOutfit = outfitSuggestionFromRag(
      rag,
      outfitMode ? "Personalised from your style DNA and closet." : ""
    );

    let reply: string | null = null;
    const providerPreference = resolveAiProvider();

    const tryOpenAI = async () => {
      try {
        reply = (await callOpenAI(system, userPrompt, history as ChatTurn[])).reply;
      } catch (err) {
        console.error("[chat] OpenAI failed:", err);
      }
    };
    const tryGemini = async () => {
      try {
        reply = (await callGemini(system, userPrompt, history as ChatTurn[])).reply;
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
        ? `${ragOutfit.reason || ruleFallback.reason}`
        : `Hey! I'm tuned to your style DNA. When you're ready, tell me the occasion — it's ${weather.temp}°C and ${weather.condition} in ${location}.`
      : trimmedReply;

    const hasRagPieces =
      ragOutfit.tops.length + ragOutfit.bottoms.length + ragOutfit.outerwear.length > 0;

    const outfitSuggestion = outfitMode
      ? hasRagPieces
        ? ragOutfit
        : ruleFallback
      : null;

    return NextResponse.json({
      reply: replyText,
      outfitSuggestion,
      personalization: {
        styleDnaApplied: Boolean(
          stylePrefs &&
            ((stylePrefs.styleVibe && stylePrefs.styleVibe !== "no-preference") ||
              (stylePrefs.colorPalette && stylePrefs.colorPalette !== "no-preference") ||
              stylePrefs.notes?.trim())
        ),
        retrievedCount: rag.items.length,
        occasionHints: rag.occasionHints,
      },
      ...(usedRuleBased ? { stylistMode: "rules" as const } : { stylistMode: "rag" as const }),
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
