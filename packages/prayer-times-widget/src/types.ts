export interface Island {
  id: number;
  category_id: number;
  atoll: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  offset_minutes: number;
}

export interface PrayerTimes {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

export interface TimesResponse {
  island: Island;
  date: string;
  day_of_year: number;
  prayers: PrayerTimes;
  prayers_raw: PrayerTimes;
}

export interface IslandsResponse {
  islands: Island[];
  grouped: Record<string, Island[]>;
}

export type PrayerKey = keyof PrayerTimes;

export type Theme = 'dark' | 'light';
export type Lang  = 'dv' | 'en';
