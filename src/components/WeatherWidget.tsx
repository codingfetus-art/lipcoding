"use client";

import { WeatherData, GeoLocation } from "@/types";
import { RefreshCw } from "lucide-react";

interface Props {
  weather: WeatherData | null;
  location: GeoLocation | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export default function WeatherWidget({ weather, location, loading, error, onRefresh }: Props) {
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">현재 날씨</h2>
        <button
          onClick={onRefresh}
          className="p-1 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
          title="새로고침"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-white/60">
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span className="text-sm">날씨 불러오는 중...</span>
        </div>
      )}

      {error && !loading && (
        <div className="text-red-300 text-sm">{error}</div>
      )}

      {weather && !loading && (
        <div>
          <div className="flex items-end gap-3 mb-3">
            <span className="text-5xl">{weather.icon}</span>
            <div>
              <div className="text-4xl font-bold text-white">{weather.temperature}°</div>
              <div className="text-white/70 text-sm">{weather.description}</div>
            </div>
          </div>

          <div className="flex gap-3 text-sm text-white/60">
            <span>💨 {weather.windSpeed}km/h</span>
            {weather.isRaining && <span className="text-blue-300">🌧 비 예보</span>}
            {weather.isSnowing && <span className="text-blue-200">❄️ 눈 예보</span>}
            {weather.isCold && <span className="text-cyan-300">🥶 추워요</span>}
            {weather.isHot && <span className="text-orange-300">🥵 더워요</span>}
          </div>

          {location && (
            <div className="mt-2 text-xs text-white/40 truncate">📍 {location.name}</div>
          )}
        </div>
      )}

      {weather && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <p className="text-xs font-semibold text-white/50 mb-2">오늘의 추천 준비물</p>
          <div className="flex flex-wrap gap-1">
            {weather.isRaining && (
              <span className="px-2 py-0.5 bg-blue-500/30 rounded-full text-xs text-blue-200">우산</span>
            )}
            {weather.isCold && (
              <>
                <span className="px-2 py-0.5 bg-cyan-500/30 rounded-full text-xs text-cyan-200">외투</span>
                <span className="px-2 py-0.5 bg-cyan-500/30 rounded-full text-xs text-cyan-200">목도리</span>
              </>
            )}
            {weather.isHot && (
              <>
                <span className="px-2 py-0.5 bg-orange-500/30 rounded-full text-xs text-orange-200">선크림</span>
                <span className="px-2 py-0.5 bg-orange-500/30 rounded-full text-xs text-orange-200">선글라스</span>
              </>
            )}
            {weather.isSnowing && (
              <span className="px-2 py-0.5 bg-indigo-500/30 rounded-full text-xs text-indigo-200">방수 신발</span>
            )}
            {!weather.isRaining && !weather.isCold && !weather.isHot && !weather.isSnowing && (
              <span className="text-xs text-white/40">특별한 준비물 없음 😊</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
