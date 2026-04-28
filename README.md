
# Clueless

Clueless is now a Next.js full-stack TypeScript app with:
- Next.js 16 App Router frontend
- API routes under `/api` for chat, try-on, and weather
- OpenAI/Gemini integration for stylist chat
- Replicate integration for virtual try-on
- Weather-aware recommendations via Open-Meteo
- Vercel-ready deployment (`vercel.json`)

## Design source

- Figma Make source: [Clueless app landing page](https://www.figma.com/design/3HtSDiVvGA6xZadJuRTuZs/Clueless-app-landing-page)

## Local development

1. Install dependencies:

```bash
pnpm install
```

2. Create a `.env.local` file (see `.env.example`).

3. Run the app:

```bash
pnpm dev
```

## Environment variables

- `AI_PROVIDER` (`openai` or `gemini`)
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `REPLICATE_API_TOKEN`
  