import { NextRequest, NextResponse } from "next/server";

type GeoCoords = { lat: number; lon: number; name: string };

async function geocodeCity(city: string): Promise<GeoCoords | null> {
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const response = await fetch(geoUrl, { cache: "no-store" });
  if (!response.ok) return null;
  const data = await response.json();
  const first = data?.results?.[0];
  if (!first) return null;
  return { lat: first.latitude, lon: first.longitude, name: first.name };
}

/** Free reverse lookup (no API key). https://www.bigdatacloud.net/ */
async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(String(lat))}&longitude=${encodeURIComponent(String(lon))}&localityLanguage=en`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, unknown>;
    const pick = [data.city, data.locality, data.principalSubdivision, data.countryName].find(
      (v): v is string => typeof v === "string" && v.trim().length > 0
    );
    return pick?.trim() ?? null;
  } catch {
    return null;
  }
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

async function weatherPayloadForCoords(geo: GeoCoords) {
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
}

export async function GET(request: NextRequest) {
  const latParam = request.nextUrl.searchParams.get("lat");
  const lonParam = request.nextUrl.searchParams.get("lon");

  try {
    if (latParam !== null && lonParam !== null) {
      const lat = Number.parseFloat(latParam);
      const lon = Number.parseFloat(lonParam);
      if (
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lon) <= 180
      ) {
        const label = (await reverseGeocode(lat, lon)) ?? "Current location";
        return weatherPayloadForCoords({ lat, lon, name: label });
      }
    }

    const city = request.nextUrl.searchParams.get("city") ?? "Berlin";
    const geo = await geocodeCity(city);
    if (!geo) {
      return NextResponse.json({ error: "City not found" }, { status: 404 });
    }

    return weatherPayloadForCoords(geo);
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
