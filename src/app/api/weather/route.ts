export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");

  if (!lat || !lon) {
    return Response.json({ error: "lat/lon 파라미터가 필요해요" }, { status: 400 });
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat);
  url.searchParams.set("longitude", lon);
  url.searchParams.set(
    "current",
    "temperature_2m,weather_code,wind_speed_10m,precipitation"
  );
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url.toString(), { next: { revalidate: 600 } });
  if (!res.ok) {
    return Response.json({ error: "날씨 API 오류" }, { status: 502 });
  }

  const data = await res.json();
  const current = data.current;

  return Response.json({
    temperature: Math.round(current.temperature_2m),
    weatherCode: current.weather_code,
    windSpeed: Math.round(current.wind_speed_10m),
    precipitation: current.precipitation,
  });
}
