// Afgevinkte stappen, per browser bewaard (localStorage). Werkt ook als opslag geblokkeerd is.
const KEY = 'venge:steps:v1';

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
export const stepKey = (taskId: string, text: string) => `${taskId}:${hash(text)}`;

let state: Record<string, true> = {};
try {
  state = JSON.parse(localStorage.getItem(KEY) ?? '{}');
} catch {
  state = {};
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* opslag niet beschikbaar: alleen in deze sessie onthouden */
  }
}
export const isDone = (k: string) => !!state[k];
export function setDone(k: string, done: boolean) {
  if (done) state[k] = true;
  else delete state[k];
  save();
}
export function resetTask(keys: string[]) {
  keys.forEach((k) => delete state[k]);
  save();
}

export const prefs = {
  get(k: string) {
    try {
      return localStorage.getItem(`venge:${k}`);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(`venge:${k}`, v);
    } catch {
      /* negeren */
    }
  },
};
