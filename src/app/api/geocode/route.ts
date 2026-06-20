export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  const reverse = searchParams.get("reverse") === "true";

  let url: URL;

  if (reverse && lat && lon) {
    url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", lat);
    url.searchParams.set("lon", lon);
    url.searchParams.set("format", "json");
  } else if (query) {
    url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "1");
  } else {
    return Response.json({ error: "q 또는 lat/lon 파라미터가 필요해요" }, { status: 400 });
  }

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "OutingPrepApp/1.0" },
    next: { revalidate: 86400 },
  });

  if (!res.ok) {
    return Response.json({ error: "지오코딩 오류" }, { status: 502 });
  }

  const data = await res.json();

  if (reverse) {
    const name =
      data.address?.city ??
      data.address?.town ??
      data.address?.village ??
      data.display_name ??
      "현재 위치";
    return Response.json({ name, lat: data.lat, lon: data.lon });
  }

  if (!Array.isArray(data) || data.length === 0) {
    return Response.json({ error: "위치를 찾을 수 없어요" }, { status: 404 });
  }

  const place = data[0];
  return Response.json({
    name: place.display_name,
    lat: parseFloat(place.lat),
    lon: parseFloat(place.lon),
  });
}
