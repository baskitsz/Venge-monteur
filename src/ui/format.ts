import { manualById, type Source, type Torque } from '../content';

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const num = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 2 });

export function torqueValue(t: Torque) {
  if (t.nmMin != null && t.nmMax != null) return `${num(t.nmMin)}–${num(t.nmMax)} Nm`;
  return t.nm != null ? `${num(t.nm)} Nm` : '–';
}

/** Bronlabel: handleiding + pagina; volledige bestandsnaam in de tooltip. */
export function sourceChip(src: Source | null) {
  if (!src) return `<span class="src own" title="Eigen aanvulling, niet uit een handleiding">Eigen aanvulling</span>`;
  const m = manualById.get(src.manual);
  const name = m?.short ?? src.manual;
  const file = m?.file ?? src.manual;
  return `<span class="src" title="${esc(`${file}, pagina ${src.page}`)}">${esc(name)} · p.${src.page}</span>`;
}

export const icon = {
  warning: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v5M12 18h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.5h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor"/></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11 12 4l8 7M6 9.5V20h12V9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  status: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7" cy="12" r="3" fill="currentColor"/><circle cx="17" cy="7" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17" cy="17" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bike: '<svg viewBox="0 0 64 40" aria-hidden="true"><circle cx="13" cy="27" r="10" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="51" cy="27" r="10" fill="none" stroke="currentColor" stroke-width="4"/><path d="M13 27 25 9h16l10 18M25 9l8 18M37 4h8" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/></svg>',
};
