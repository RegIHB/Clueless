import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { buildFallbackSuggestion } from "@/lib/outfit-fallback";
import { wantsOutfitRecommendation } from "@/lib/outfit-intent";

const requestSchema = z.object({
  message: z.string().min(1),
  location: z.string().default("Berlin"),
  weather: z.object({
    temp: z.number().default(12),
    condition: z.string().default("Cloudy"),
  }),
});

type ProviderResult = { reply: string };

function stylistSystemPrompt(outfitMode: boolean): string {
  if (outfitMode) {
    return "You are an AI fashion stylist. The user wants outfit help. Give concise, practical advice for their plans and the weather. No markdown headings.";
  }
  return "You are a friendly AI fashion stylist chatting with the user. They are NOT asking for a full outfit yet (greeting, small talk, or general question). Reply warmly and briefly—one or two short paragraphs max. Do NOT list specific garments, SKUs, or a full outfit. If it fits naturally, invite them to share their plans or occasion when they want concrete suggestions. No markdown headings.";
}

async function callOpenAI(prompt: string, outfitMode: boolean): Promise<ProviderResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: stylistSystemPrompt(outfitMode),
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

async function callGemini(prompt: string, outfitMode: boolean): Promise<ProviderResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  // Free-tier friendly default; override with GEMINI_MODEL (e.g. gemini-2.5-flash).
  const modelId = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: modelId });
  const fullPrompt = `${stylistSystemPrompt(outfitMode)}\n\n${prompt}`;
  const result = await model.generateContent(fullPrompt);
  const reply = result.response.text().trim();
  if (!reply) throw new Error("Gemini response empty");
  return { reply };
}

export async function POST(request: NextRequest) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { message, location, weather } = parsed.data;
    const outfitMode = wantsOutfitRecommendation(message);
    const fallback = buildFallbackSuggestion(message, weather.temp, weather.condition);

    const prompt = [
      `User location: ${location}.`,
      `Weather: ${weather.temp}C and ${weather.condition}.`,
      `User message: ${message}`,
      outfitMode
        ? "Give concise recommendations with practical reasoning."
        : "Respond conversationally only—no outfit rundown unless they ask.",
    ].join("\n");

    let reply: string | null = null;
    const providerPreference = resolveAiProvider();

    const tryOpenAI = async () => {
      try {
        reply = (await callOpenAI(prompt, outfitMode)).reply;
      } catch (err) {
        console.error("[chat] OpenAI failed:", err);
      }
    };
    const tryGemini = async () => {
      try {
        reply = (await callGemini(prompt, outfitMode)).reply;
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
