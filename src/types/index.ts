export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  category?: string;
  durationMinutes?: number;
  durationSource?: "ai" | "user";
  createdAt: number;
}

export interface Checklist {
  id: string;
  name: string;
  destination?: string;
  eventTime?: number;
  items: ChecklistItem[];
  createdAt: number;
}

export interface Alarm {
  id: string;
  label: string;
  triggerAt: number;
  checklistId?: string;
  fired: boolean;
}

export interface WeatherData {
  temperature: number;
  weatherCode: number;
  windSpeed: number;
  description: string;
  icon: string;
  isRaining: boolean;
  isSnowing: boolean;
  isCold: boolean;
  isHot: boolean;
}

export interface GeoLocation {
  lat: number;
  lon: number;
  name: string;
}

export interface TravelTimeResult {
  durationSeconds: number;
  durationMinutes: number;
  distanceMeters: number;
}
