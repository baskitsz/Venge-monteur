// Zoeken over onderdelen, taken, stappen, aandraaimomenten en waarschuwingen.
import { parts } from '../content';
import { stepKey } from '../progress';
import { esc, torqueValue } from './format';

export interface Hit { partId: string; partName: string; kind: string; text: string; taskId?: string; stepKey?: string; section?: string; score: number }
interface Entry extends Omit<Hit, 'score'> { norm: string; weight: number }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const index: Entry[] = [];
for (const p of parts) {
  const base = { partId: p.id, partName: p.name };
  const push = (kind: string, text: string, weight: number, extra: Partial<Entry> = {}, context = '') =>
    index.push({ ...base, kind, text, weight, norm: norm(`${p.name} ${context} ${text}`), ...extra });
  push('Onderdeel', p.description, 10);
  for (const t of p.tasks) {
    push('Taak', t.title, 6, { taskId: t.id });
    for (const s of t.steps) push('Stap', s.text, 2, { taskId: t.id, stepKey: stepKey(t.id, s.text) }, t.title);
  }
  for (const t of p.torques) push('Aandraaimoment', `${t.location}: ${torqueValue(t)}`, 4, { section: 'torques' });
  for (const s of p.specs ?? []) push('Specificatie', `${s.label}: ${s.value}`, 3, { section: 'specs' });
  for (const w of p.warnings) push('Waarschuwing', w.text, 2, { section: 'warnings' });
  for (const t of p.tools) push('Gereedschap', t.label, 1, { section: 'tools' });
}

// eenvoudige woordstam: 'ontluchten' vindt ook 'ontluchtingsnippel', 'remblokken' ook 'remblok'
const stem = (t: string) => (t.length > 5 ? t.slice(0, -2) : t);
const has = (hay: string, t: string) => hay.includes(t) || hay.includes(stem(t));

export function search(q: string, limit = 12): Hit[] {
  const tokens = norm(q).split(/\s+/).filter((t) => t.length > 1);
  if (!tokens.length) return [];
  const hits: Hit[] = [];
  for (const e of index) {
    if (!tokens.every((t) => has(e.norm, t))) continue;
    const nameHit = tokens.some((t) => has(norm(e.partName), t)) ? 8 : 0;
    const textHit = tokens.filter((t) => has(norm(e.text), t)).length * 3;
    hits.push({ ...e, score: e.weight + nameHit + textHit });
  }
  // per onderdeel maximaal 3 resultaten, zodat de lijst gevarieerd blijft
  const per = new Map<string, number>();
  return hits
    .sort((a, b) => b.score - a.score)
    .filter((h) => {
      const n = (per.get(h.partId) ?? 0) + 1;
      per.set(h.partId, n);
      return n <= 3;
    })
    .slice(0, limit);
}

export function highlight(text: string, q: string) {
  const tokens = norm(q).split(/\s+/).filter((t) => t.length > 1);
  const n = norm(text);
  const marks = new Array(text.length).fill(false);
  for (const t0 of tokens) {
    const t = n.includes(t0) ? t0 : stem(t0);
    let i = n.indexOf(t);
    while (i >= 0) {
      for (let k = i; k < i + t.length; k++) marks[k] = true;
      i = n.indexOf(t, i + 1);
    }
  }
  let out = '';
  let open = false;
  for (let i = 0; i < text.length; i++) {
    if (marks[i] && !open) (out += '<mark>'), (open = true);
    if (!marks[i] && open) (out += '</mark>'), (open = false);
    out += esc(text[i]);
  }
  return open ? out + '</mark>' : out;
}
