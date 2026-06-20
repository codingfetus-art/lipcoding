export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const originLat = searchParams.get("originLat");
  const originLon = searchParams.get("originLon");
  const destLat = searchParams.get("destLat");
  const destLon = searchParams.get("destLon");

  if (!originLat || !originLon || !destLat || !destLon) {
    return Response.json({ error: "출발지/목적지 좌표가 필요해요" }, { status: 400 });
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${originLon},${originLat};${destLon},${destLat}?overview=false`;

  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) {
    return Response.json({ error: "경로 계산 오류" }, { status: 502 });
  }

  const data = await res.json();

  if (data.code !== "Ok" || !data.routes?.length) {
    return Response.json({ error: "경로를 찾을 수 없어요" }, { status: 404 });
  }

  const route = data.routes[0];
  return Response.json({
    durationSeconds: Math.round(route.duration),
    durationMinutes: Math.round(route.duration / 60),
    distanceMeters: Math.round(route.distance),
  });
}
