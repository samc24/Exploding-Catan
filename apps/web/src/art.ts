/* Optional art. Anything missing falls back to drawing; nothing waits on a load. */
import type { CardKey, Res, Terrain } from "@exploding-catan/engine";
import { AVATAR_IDS } from "@exploding-catan/protocol";

const BASE = "./art/";
export const hexArt = (t: Terrain) => `${BASE}hex-${t}.png`;
export const resArt = (r: Res) => `${BASE}res-${r}.png`;
export const resBack = `${BASE}res-back.png`;
export const cardBack = `${BASE}card-back.png`;
export function cardArt(key: CardKey, flavor: string | null): string {
  if (key === "knight" && flavor) {
    const f = flavor.toLowerCase().replace(" cat", "").trim();
    return `${BASE}card-knight-${f}.png`;
  }
  return `${BASE}card-${key}.png`;
}
export const avatarArt = (n: number) => `${BASE}profile/${n}.png`;

/* Which files actually exist, learned once by probing; used to decide whether
   to draw a texture or a flat colour so nothing flashes a broken image. */
const known = new Map<string, boolean>();
export function probe(url: string): Promise<boolean> {
  const k = known.get(url);
  if (k !== undefined) return Promise.resolve(k);
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => { known.set(url, true); res(true); };
    img.onerror = () => { known.set(url, false); res(false); };
    img.src = url;
  });
}
export function has(url: string): boolean { return known.get(url) === true; }
export async function preload(): Promise<void> {
  const terrains: Terrain[] = ["wood", "brick", "sheep", "wheat", "ore", "desert"];
  const keys: CardKey[] = ["implode", "vp", "skip", "nope", "explode", "defuse", "alter", "attack", "favor", "reverse", "knight"];
  const urls = [
    ...terrains.map(hexArt),
    ...(["wood", "brick", "sheep", "wheat", "ore"] as Res[]).map(resArt),
    ...keys.map((k) => cardArt(k, null)),
    ...["beard", "watermelon", "potato", "rainbow", "taco"].map((f) => `${BASE}card-knight-${f}.png`),
    cardBack, resBack,
    ...AVATAR_IDS.map((id) => avatarArt(Number(id))),
  ];
  await Promise.all(urls.map(probe));
}
