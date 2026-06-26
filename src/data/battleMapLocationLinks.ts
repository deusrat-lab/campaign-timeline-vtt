/**
 * Derives { locationStateId, battleMapId, confidence, reason } links between
 * LocationStates and battle-map-vtt maps, using the read-only manifest copy
 * at /public/data/battle-map-vtt/manifest.json (see battleMapManifest.ts).
 *
 * `battleMapId` now refers to a battle-map-vtt manifest map id
 * (e.g. "map-577b83878a6cc2b5"), NOT a dm-companion images.json id.
 *
 * Matching approach: normalize + tokenize + crude Russian-suffix stemming on
 * both the manifest map title and a location's own title/tags/region, then
 * compare token SETS (not exact string equality) so that e.g. "Большой
 * Рынок" (map) and "Рыночная площадь" (location, tag "рынок") still overlap
 * on the stemmed token "рынок". This is intentionally loose substring/stem
 * matching, not exact equality — these names are related but never identical
 * across the two apps.
 *
 * Confidence buckets:
 *   - exact: strong relative token overlap (>= EXACT_THRESHOLD of the smaller
 *     token set) AND the match is unambiguous (no other candidate location
 *     ties/beats it for this map).
 *   - likely: some overlap exists but is weaker, or several locations are
 *     plausible candidates for the same map.
 *   - manual_required: no map has any token overlap with any location at
 *     all — nothing here is invented from thin air.
 *
 * This module never mutates dm-companion or battle-map-vtt files; it only
 * reads the manifest copy and computes an in-memory link list.
 */
import type { DmLocation } from '../types/dmCompanion';
import type { BattleMapLocationLink, LocationState } from '../types';
import type { BattleMapManifestEntry } from './battleMapManifest';

// Russian stopwords that carry no disambiguating signal for map/location names.
const STOPWORDS = new Set([
  'и', 'у', 'на', 'в', 'к', 'с', 'со', 'от', 'до', 'для', 'по', 'за', 'из',
  'возле', 'неподалёку', 'около', 'через', 'дороге', 'это', 'эта', 'этот',
]);

// Longest-suffix-first crude Russian stemmer: strips common case/number/
// adjective endings. Not linguistically rigorous, just enough to fold
// "рынок"/"рыночная"/"рынка" etc. onto a shared stem for token-set overlap.
const SUFFIXES = [
  'ями', 'ами', 'его', 'ому', 'ему', 'ыми', 'ого', 'ах', 'ях',
  'ов', 'ев', 'ей', 'ию', 'ия', 'ие', 'ье', 'ью',
  'ам', 'ям', 'ом', 'ем', 'ой', 'ый', 'ая', 'яя', 'ое', 'ее',
  'ы', 'и', 'а', 'я', 'е', 'о', 'у', 'ю', 'ь',
];

function stem(token: string): string {
  for (const suf of SUFFIXES) {
    if (token.length - suf.length >= 3 && token.endsWith(suf)) {
      return token.slice(0, -suf.length);
    }
  }
  return token;
}

function tokenize(raw: string): Set<string> {
  const normalized = raw.toLowerCase().replace(/[^a-zа-яё0-9\s]/gi, ' ');
  const out = new Set<string>();
  for (const tok of normalized.split(/\s+/)) {
    if (tok.length <= 2 || STOPWORDS.has(tok)) continue;
    out.add(stem(tok));
  }
  return out;
}

function mapTitleTokens(map: BattleMapManifestEntry): Set<string> {
  return tokenize(map.title ?? map.normalizedName ?? '');
}

function locationTextTokens(ls: LocationState, baseLocation?: DmLocation): Set<string> {
  const parts = [ls.title, ...(ls.tags ?? [])];
  if (baseLocation) {
    parts.push(baseLocation.name, baseLocation.region ?? '', ...(baseLocation.tags ?? []));
  }
  return tokenize(parts.filter(Boolean).join(' '));
}

interface Candidate {
  locationStateId: string;
  overlapCount: number;
  overlapRatio: number;
  overlapTokens: string[];
}

const EXACT_RATIO_THRESHOLD = 0.6;
const EXACT_MIN_OVERLAP = 1;

/**
 * Build battle-map <-> LocationState links by comparing stemmed token sets.
 * `locations` is the raw dm-companion location list (for name/region/tags
 * fallback when a LocationState's own title/tags are sparse); `manifestMaps`
 * is the battle-map-vtt manifest copy.
 */
export function buildBattleMapLocationLinks(
  manifestMaps: BattleMapManifestEntry[],
  locationStates: LocationState[],
  locations: DmLocation[] = [],
): BattleMapLocationLink[] {
  const links: BattleMapLocationLink[] = [];
  const locationById = new Map(locations.map((l) => [l.id, l]));

  // Pre-tokenize every location once.
  const locationTokens = locationStates.map((ls) => ({
    ls,
    tokens: locationTextTokens(ls, locationById.get(ls.locationId)),
  }));

  for (const map of manifestMaps) {
    const mapTokens = mapTitleTokens(map);
    if (mapTokens.size === 0) {
      links.push({
        locationStateId: '',
        battleMapId: map.id,
        confidence: 'manual_required',
        reason: 'Карта без распознаваемого названия — нужна проверка ДМ',
      });
      continue;
    }

    const candidates: Candidate[] = [];
    for (const { ls, tokens } of locationTokens) {
      if (tokens.size === 0) continue;
      const overlap = [...tokens].filter((t) => mapTokens.has(t));
      if (overlap.length === 0) continue;
      const ratio = overlap.length / Math.min(tokens.size, mapTokens.size);
      candidates.push({
        locationStateId: ls.id,
        overlapCount: overlap.length,
        overlapRatio: ratio,
        overlapTokens: overlap,
      });
    }

    if (candidates.length === 0) {
      links.push({
        locationStateId: '',
        battleMapId: map.id,
        confidence: 'manual_required',
        reason: `Нет текстового совпадения между «${map.title}» и названиями/тегами локаций — нужна проверка ДМ`,
      });
      continue;
    }

    candidates.sort((a, b) => b.overlapRatio - a.overlapRatio || b.overlapCount - a.overlapCount);
    const best = candidates[0];
    const runnerUp = candidates[1];
    const isUnambiguous = !runnerUp || best.overlapRatio > runnerUp.overlapRatio || best.overlapCount > runnerUp.overlapCount;
    const isStrong = best.overlapRatio >= EXACT_RATIO_THRESHOLD && best.overlapCount >= EXACT_MIN_OVERLAP;

    for (const c of candidates) {
      const isBest = c === best;
      const confidence: BattleMapLocationLink['confidence'] =
        isBest && isStrong && isUnambiguous ? 'exact' : 'likely';
      links.push({
        locationStateId: c.locationStateId,
        battleMapId: map.id,
        confidence,
        reason:
          confidence === 'exact'
            ? `Совпадение по словам [${c.overlapTokens.join(', ')}] между «${map.title}» и названием/тегами локации`
            : `Частичное совпадение по словам [${c.overlapTokens.join(', ')}] между «${map.title}» и названием/тегами локации`,
      });
    }
  }

  return links;
}
