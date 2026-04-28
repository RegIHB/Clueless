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

  const client = new OpenAI({ apiKey });
  const completion = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });

  const reply = completion.output_text?.trim();
  if (!reply) throw new Error("OpenAI response empty");
  return { reply };
}

async function callGemini(prompt: string): Promise<ProviderResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: "gemini-1.5-flash" });
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
    const providerPreference = (process.env.AI_PROVIDER ?? "openai").toLowerCase();

    if (providerPreference === "gemini") {
      try {
        reply = (await callGemini(prompt)).reply;
      } catch {
        reply = (await callOpenAI(prompt)).reply;
      }
    } else {
      try {
        reply = (await callOpenAI(prompt)).reply;
      } catch {
        reply = (await callGemini(prompt)).reply;
      }
    }

    return NextResponse.json({
      reply: reply ?? fallback.reason,
      outfitSuggestion: fallback,
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
