/**
 * Yahoo's fantasy JSON is XML translated literally: collections are objects
 * with numeric string keys plus a "count", and each entity is an ARRAY of
 * fragment objects (some of which are themselves arrays). These helpers
 * flatten that back into sane objects.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** {"0": a, "1": b, count: 2} → [a, b] */
export function yahooCollection(obj: any): any[] {
  if (!obj || typeof obj !== "object") return [];
  const out: any[] = [];
  for (let i = 0; ; i++) {
    const item = obj[String(i)];
    if (item === undefined) break;
    out.push(item);
  }
  return out;
}

/** Merge an entity's fragment array (possibly nested arrays) into one object. */
export function yahooMerge(fragments: any): Record<string, any> {
  const out: Record<string, any> = {};
  const absorb = (frag: any) => {
    if (frag == null) return;
    if (Array.isArray(frag)) {
      for (const f of frag) absorb(f);
      return;
    }
    if (typeof frag === "object") Object.assign(out, frag);
  };
  absorb(fragments);
  return out;
}

/** Walk a path of keys defensively, returning undefined when absent. */
export function dig(obj: any, ...path: (string | number)[]): any {
  let cur = obj;
  for (const key of path) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}
