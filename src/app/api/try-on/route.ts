import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import { z } from "zod";

const tryOnSchema = z.object({
  personImageUrl: z.string().min(1),
  garmentImageUrl: z.string().min(1),
  prompt: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = tryOnSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "Missing REPLICATE_API_TOKEN" },
        { status: 500 }
      );
    }

    const replicate = new Replicate({ auth: token });
    const input = {
      person_image: parsed.data.personImageUrl,
      garment_image: parsed.data.garmentImageUrl,
      prompt: parsed.data.prompt ?? "High quality virtual try-on",
    };

    const output = await replicate.run("prithivMLmods/idm-vton:latest", { input });

    return NextResponse.json({ output });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Try-on service failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
