import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import type { WeatherContext, ForecastDay } from './api/types';

const WEATHER_SYNC_KEY = 'weather_sync_enabled_v1';

export type WeatherCoords = {
  latitude: number;
  longitude: number;
};

export async function getWeatherSyncEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(WEATHER_SYNC_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setWeatherSyncEnabled(enabled: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(WEATHER_SYNC_KEY, enabled ? '1' : '0');
  } catch {
    // best-effort preference persistence
  }
}

export async function getLocationPermissionLabel(): Promise<string> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status === Location.PermissionStatus.GRANTED) return 'Allowed';
    if (perm.status === Location.PermissionStatus.DENIED) return 'Denied';
    return 'Not asked yet';
  } catch {
    return 'Unknown';
  }
}

export async function requestCurrentCoordinates(): Promise<WeatherCoords> {
  const existing = await Location.getForegroundPermissionsAsync();
  let status = existing.status;
  if (status !== Location.PermissionStatus.GRANTED) {
    const requested = await Location.requestForegroundPermissionsAsync();
    status = requested.status;
  }
  if (status !== Location.PermissionStatus.GRANTED) {
    throw new Error('Location permission is required for local weather sync.');
  }
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
  };
}

function roundTemp(c?: number | null): string {
  if (c == null) return '--';
  return `${Math.round((c * 9) / 5 + 32)}F`;
}

export function weatherHeadline(weather?: WeatherContext | null): string {
  if (!weather) return 'Weather not synced';
  const temp = roundTemp(weather.apparent_temperature_c ?? weather.temperature_c);
  const place = weather.location_name ? `${weather.location_name} · ` : '';
  return `${place}${temp} · ${weather.condition}`;
}

export function weatherDetail(weather?: WeatherContext | null): string {
  if (!weather) return 'Turn on sync to bias outfits toward today.';
  const pieces = [
    `${roundTemp(weather.min_temp_c)}–${roundTemp(weather.max_temp_c)}`,
    `${weather.precipitation_probability ?? 0}% rain`,
    `${Math.round(weather.wind_speed_kmh ?? 0)} km/h wind`,
    weather.derived_season,
  ];
  return pieces.join(' · ');
}

export function forecastSummary(days: ForecastDay[]): string {
  if (days.length === 0) return 'No forecast loaded yet.';
  const first = days[0];
  const last = days[days.length - 1];
  const range =
    first.date === last.date ? first.date : `${first.date} to ${last.date}`;
  const avgRain =
    days.reduce((sum, day) => sum + (day.precipitation_probability ?? 0), 0) /
    days.length;
  return `${range} · ${roundTemp(first.min_temp_c)}–${roundTemp(first.max_temp_c)} · ${Math.round(avgRain)}% avg rain`;
}
