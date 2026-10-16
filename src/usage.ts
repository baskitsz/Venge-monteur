// Gebruiksdata (kilometers) en status per onderdeel.
//
// De bron is uitwisselbaar via de UsageSource-interface. Nu: een lokaal bestand (content/usage.json).
// Later kan hier bijvoorbeeld een StravaSource bij komen die de kilometerstand van de fiets ophaalt
// (Strava API: GET /athlete en /gear/{id} → distance in meters). Omdat Strava OAuth een geheime sleutel
// nodig heeft, hoort dat via een kleine serverless functie te lopen en niet rechtstreeks in de browser.
import usageFile from '../content/usage.json';

export interface PartUsage {
  lastServiceKm?: number | null;
  lastServiceDate?: string | null;
  intervalKm?: number | null;
  intervalMonths?: number | null;
  note?: string;
}
export interface UsageData {
  source: string;
  updated: string | null;
  bikeKm: number | null;
  parts: Record<string, PartUsage>;
}
export interface UsageSource {
  readonly name: string;
  load(): Promise<UsageData>;
}

export class LocalFileSource implements UsageSource {
  readonly name = 'Lokaal bestand (content/usage.json)';
  async load() {
    return usageFile as UsageData;
  }
}

export type StatusLevel = 'ok' | 'soon' | 'due' | 'unknown';
export interface PartStatus { level: StatusLevel; label: string; detail: string; ratio: number | null }

export const STATUS_LABEL: Record<StatusLevel, string> = {
  ok: 'In orde',
  soon: 'Binnenkort',
  due: 'Onderhoud nodig',
  unknown: 'Geen gegevens',
};

const SOON = 0.8; // vanaf 80% van het eigen interval: 'binnenkort'

export function statusFor(u: PartUsage | undefined, bikeKm: number | null, today = new Date()): PartStatus {
  const ratios: { r: number; text: string }[] = [];
  if (u?.intervalKm && bikeKm != null && u.lastServiceKm != null) {
    const used = bikeKm - u.lastServiceKm;
    ratios.push({ r: used / u.intervalKm, text: `${fmtInt(used)} van ${fmtInt(u.intervalKm)} km sinds laatste onderhoud` });
  }
  if (u?.intervalMonths && u.lastServiceDate) {
    const months = (today.getTime() - new Date(u.lastServiceDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    ratios.push({ r: months / u.intervalMonths, text: `${months.toFixed(1).replace('.', ',')} van ${u.intervalMonths} maanden` });
  }
  if (!ratios.length) return { level: 'unknown', label: STATUS_LABEL.unknown, detail: 'Vul km of datum en een eigen interval in content/usage.json in.', ratio: null };
  const worst = ratios.sort((a, b) => b.r - a.r)[0];
  const level: StatusLevel = worst.r >= 1 ? 'due' : worst.r >= SOON ? 'soon' : 'ok';
  return { level, label: STATUS_LABEL[level], detail: worst.text, ratio: worst.r };
}

const fmtInt = (n: number) => Math.round(n).toLocaleString('nl-NL');
