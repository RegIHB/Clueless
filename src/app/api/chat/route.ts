import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { buildFallbackSuggestion } from "@/lib/outfit-fallback";

const requestSchema = z.object({
  message: z.string().min(1),
  location: z.string().default("Berlin"),
  weather: z.object({
    temp: z.number().default(12),
    condition: z.string().default("Cloudy"),
  }),
});

type ProviderResult = { reply: string };

async function callOpenAI(prompt: string): Promise<ProviderResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are an AI fashion stylist. Give concise, practical outfit advice for the user's plans and weather. No markdown headings.",
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

async function callGemini(prompt: string): Promise<ProviderResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  // Free-tier friendly default; override with GEMINI_MODEL (e.g. gemini-2.5-flash).
  const modelId = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: modelId });
  const result = await model.generateContent(prompt);
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
    const fallback = buildFallbackSuggestion(message, weather.temp, weather.condition);

    const prompt = [
      "You are an AI fashion stylist.",
      `User location: ${location}.`,
      `Weather: ${weather.temp}C and ${weather.condition}.`,
      `User message: ${message}`,
      "Give concise recommendations with practical reasoning.",
    ].join("\n");

    let reply: string | null = null;
    const providerPreference = resolveAiProvider();

    const tryOpenAI = async () => {
      try {
        reply = (await callOpenAI(prompt)).reply;
      } catch (err) {
        console.error("[chat] OpenAI failed:", err);
      }
    };
    const tryGemini = async () => {
      try {
        reply = (await callGemini(prompt)).reply;
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
      ? `${fallback.reason} The picks below match your plans and the weather.`
      : trimmedReply;

    return NextResponse.json({
      reply: replyText,
      outfitSuggestion: fallback,
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
