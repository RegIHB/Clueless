import { NextRequest, NextResponse } from "next/server";

type GeoResult = { lat: number; lon: number; name: string } | null;

async function geocodeCity(city: string): Promise<GeoResult> {
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const response = await fetch(geoUrl, { cache: "no-store" });
  if (!response.ok) return null;
  const data = await response.json();
  const first = data?.results?.[0];
  if (!first) return null;
  return { lat: first.latitude, lon: first.longitude, name: first.name };
}

function codeToCondition(code: number): string {
  if ([0].includes(code)) return "Clear";
  if ([1, 2, 3].includes(code)) return "Cloudy";
  if ([45, 48].includes(code)) return "Foggy";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rainy";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snowy";
  if ([95, 96, 99].includes(code)) return "Stormy";
  return "Unknown";
}

export async function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get("city") ?? "Berlin";

  try {
    const geo = await geocodeCity(city);
    if (!geo) {
      return NextResponse.json(
        { error: "City not found" },
        { status: 404 }
      );
    }

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current=temperature_2m,weather_code`;
    const weatherResponse = await fetch(weatherUrl, { cache: "no-store" });
    if (!weatherResponse.ok) {
      return NextResponse.json({ error: "Weather fetch failed" }, { status: 502 });
    }

    const weatherData = await weatherResponse.json();
    const temp = weatherData?.current?.temperature_2m;
    const code = weatherData?.current?.weather_code;

    return NextResponse.json({
      city: geo.name,
      weather: {
        tempC: typeof temp === "number" ? Math.round(temp) : 12,
        condition: typeof code === "number" ? codeToCondition(code) : "Cloudy",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unexpected weather service error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
