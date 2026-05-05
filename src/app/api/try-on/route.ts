import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createTryOnJob } from '@/lib/vto/jobs';

const tryOnSchema = z.object({
  personImageUrl: z.string().min(1),
  garments: z
    .array(
      z.object({
        imageUrl: z.string().min(1),
        category: z.enum(['upper_body', 'lower_body', 'dresses']),
        prompt: z.string().optional(),
        code: z.string().optional(),
      })
    )
    .min(1)
    .optional(),
  garmentImageUrl: z.string().min(1).optional(),
  prompt: z.string().optional(),
  category: z.enum(['upper_body', 'lower_body', 'dresses']).optional(),
  crop: z.boolean().optional(),
  steps: z.number().int().min(1).max(40).optional(),
}).superRefine((value, ctx) => {
  const hasGarments = Array.isArray(value.garments) && value.garments.length > 0;
  if (!hasGarments && !value.garmentImageUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['garments'],
      message: 'Provide at least one garment image.',
    });
  }
});

export async function POST(request: NextRequest) {
  try {
    const parsed = tryOnSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const garments =
      parsed.data.garments && parsed.data.garments.length > 0
        ? parsed.data.garments
        : parsed.data.garmentImageUrl
          ? [
              {
                imageUrl: parsed.data.garmentImageUrl,
                category: parsed.data.category ?? 'upper_body',
                prompt: parsed.data.prompt,
              },
            ]
          : [];

    const job = createTryOnJob({
      personImageUrl: parsed.data.personImageUrl,
      garments,
      crop: parsed.data.crop,
      steps: parsed.data.steps,
    });
    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    console.error('[try-on]', error);
    return NextResponse.json(
      {
        error: 'Try-on job could not be created',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
