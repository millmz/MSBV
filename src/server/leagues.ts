import type { League } from "../core/types.js";
import { storeGet } from "./store.js";

export function getLeagues(): League[] {
  const leagues: League[] = [];
  const espn = storeGet<League>("league_espn");
  if (espn) leagues.push(espn);
  const yahoo = storeGet<League>("league_yahoo");
  if (yahoo) leagues.push(yahoo);
  return leagues;
}

export function getLeague(id: string): League | undefined {
  return getLeagues().find((l) => l.id === id);
}
