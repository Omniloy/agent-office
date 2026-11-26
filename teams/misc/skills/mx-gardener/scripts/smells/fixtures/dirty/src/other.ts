// eslint-disable-next-line no-explicit-any
export function isRecord(x: any) {
  return (x as any) !== null;
}
export function later(fn: () => void) {
  setTimeout(() => fn(), 0);
}
export function read(s: { a?: { b?: { c?: { d: number } } } }) {
  // workaround for now: the API sometimes returns nothing
  try { return s?.a?.b?.c?.d; } catch {}
}
