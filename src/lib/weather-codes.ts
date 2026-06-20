export interface WeatherCodeInfo {
  description: string;
  icon: string;
  isRaining: boolean;
  isSnowing: boolean;
}

const WEATHER_CODES: Record<number, WeatherCodeInfo> = {
  0: { description: "맑음", icon: "☀️", isRaining: false, isSnowing: false },
  1: { description: "대체로 맑음", icon: "🌤️", isRaining: false, isSnowing: false },
  2: { description: "부분적으로 흐림", icon: "⛅", isRaining: false, isSnowing: false },
  3: { description: "흐림", icon: "☁️", isRaining: false, isSnowing: false },
  45: { description: "안개", icon: "🌫️", isRaining: false, isSnowing: false },
  48: { description: "짙은 안개", icon: "🌫️", isRaining: false, isSnowing: false },
  51: { description: "약한 이슬비", icon: "🌦️", isRaining: true, isSnowing: false },
  53: { description: "이슬비", icon: "🌦️", isRaining: true, isSnowing: false },
  55: { description: "강한 이슬비", icon: "🌦️", isRaining: true, isSnowing: false },
  61: { description: "약한 비", icon: "🌧️", isRaining: true, isSnowing: false },
  63: { description: "비", icon: "🌧️", isRaining: true, isSnowing: false },
  65: { description: "강한 비", icon: "🌧️", isRaining: true, isSnowing: false },
  71: { description: "약한 눈", icon: "🌨️", isRaining: false, isSnowing: true },
  73: { description: "눈", icon: "🌨️", isRaining: false, isSnowing: true },
  75: { description: "강한 눈", icon: "❄️", isRaining: false, isSnowing: true },
  80: { description: "소나기", icon: "🌦️", isRaining: true, isSnowing: false },
  81: { description: "비", icon: "🌧️", isRaining: true, isSnowing: false },
  82: { description: "폭우", icon: "⛈️", isRaining: true, isSnowing: false },
  95: { description: "천둥번개", icon: "⛈️", isRaining: true, isSnowing: false },
  96: { description: "우박 동반 폭풍", icon: "⛈️", isRaining: true, isSnowing: false },
  99: { description: "심한 우박 폭풍", icon: "⛈️", isRaining: true, isSnowing: false },
};

export function getWeatherCodeInfo(code: number): WeatherCodeInfo {
  return (
    WEATHER_CODES[code] ?? {
      description: "알 수 없음",
      icon: "🌡️",
      isRaining: false,
      isSnowing: false,
    }
  );
}
