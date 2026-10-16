// Laadt de onderhoudsdata uit content/ (wordt bij het bouwen meegebundeld; niets is hardcoded in de UI).
import manualsFile from '../content/manuals.json';

export interface Source { manual: string; page: number }
export interface Step { text: string; source: Source | null }
export interface Task { id: string; title: string; origin: 'manual' | 'own'; steps: Step[] }
export interface Torque { location: string; nm?: number; nmMin?: number; nmMax?: number; inlbf?: number; tool?: string; note?: string; source: Source }
export interface Spec { label: string; value: string; source: Source }
export interface Interval { label: string; when: string; source: Source }
export interface Warning { level: 'warning' | 'caution' | 'info'; text: string; source: Source | null; origin?: 'own' }
export interface Tool { label: string; source: Source }
export interface PartNo { partNo: string; label: string; source: Source }
export interface Part {
  id: string;
  name: string;
  group: string;
  coverage: 'goed' | 'deels' | 'geen';
  description: string;
  caution?: 'carbon' | 'remmen';
  tools: Tool[];
  torques: Torque[];
  specs?: Spec[];
  intervals: Interval[];
  tasks: Task[];
  warnings: Warning[];
  parts?: PartNo[];
  notFound: string[];
  neededManuals: string[];
}
export interface Manual { id: string; file: string; title: string; short: string; pages: number; use: string; note: string; language: string }

const files = import.meta.glob<Part>('../content/parts/*.json', { eager: true, import: 'default' });

export const GROUP_ORDER = ['Frame & cockpit', 'Aandrijving', 'Remmen & bediening', 'Wielen', 'Elektronica'];
export const parts: Part[] = Object.values(files).sort(
  (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.name.localeCompare(b.name, 'nl'),
);
export const partById = new Map(parts.map((p) => [p.id, p]));
export const manuals: Manual[] = (manualsFile as { manuals: Manual[] }).manuals;
export const manualById = new Map(manuals.map((m) => [m.id, m]));
