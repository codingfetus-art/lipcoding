"use client";

import { useState, useEffect, useCallback } from "react";
import { WeatherData, GeoLocation } from "@/types";
import { getWeatherCodeInfo } from "@/lib/weather-codes";

export function useWeather() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWeather = useCallback(async (lat: number, lon: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/weather?lat=${lat}&lon=${lon}`
      );
      if (!res.ok) throw new Error("날씨 정보를 가져오지 못했어요");
      const data = await res.json();
      const info = getWeatherCodeInfo(data.weatherCode);
      setWeather({
        temperature: data.temperature,
        weatherCode: data.weatherCode,
        windSpeed: data.windSpeed,
        description: info.description,
        icon: info.icon,
        isRaining: info.isRaining,
        isSnowing: info.isSnowing,
        isCold: data.temperature <= 5,
        isHot: data.temperature >= 28,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "날씨 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("이 브라우저는 위치 정보를 지원하지 않아요");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        try {
          const res = await fetch(`/api/geocode?lat=${lat}&lon=${lon}&reverse=true`);
          const geo = await res.json();
          setLocation({ lat, lon, name: geo.name ?? "현재 위치" });
          await fetchWeather(lat, lon);
        } catch {
          setLocation({ lat, lon, name: "현재 위치" });
          await fetchWeather(lat, lon);
        }
      },
      () => {
        setError("위치 권한이 필요해요. 브라우저에서 위치 접근을 허용해 주세요.");
        setLoading(false);
      },
      { timeout: 10000 }
    );
  }, [fetchWeather]);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  return { weather, location, loading, error, refresh: requestLocation };
}
