import type { Brief } from "@/lib/domain/brief";
import { propertyTypeLabels, type PropertyType } from "@/lib/domain/listing-card";
import { formatPrice, pluralize } from "@/lib/format";

// The match score (spec 0006, AC-5): fixed weights, computed on the server,
// never by the model. The same listing and brief always give the same result.

export const nearbyKm = 3;
// Price band around the budget that still counts as a close match.
export const budgetSlack = 0.15;

const weights = { budget: 35, areas: 25, bedrooms: 15, type: 10, amenities: 15 } as const;

export type ScoredListing = {
  id: string;
  refCode: string;
  priceBdt: number;
  propertyType: PropertyType;
  areaId: string;
  bedrooms: number | null;
  amenityIds: string[];
  publishedAt: string;
};

export type AreaInfo = { name: string; lat: number; lng: number };

export type MatchContext = {
  areas: Map<string, AreaInfo>;
  amenityLabels: Map<string, string>;
};

export type MatchResult = {
  matchPercent: number | null;
  exact: boolean;
  why: string[];
  differs: string[];
};

export type MatchCard = MatchResult & { listingId: string; refCode: string };

// Great circle distance in km between two points (haversine).
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// The chosen area nearest to `areaId`, with its distance; null when none is known.
export function nearestChosenArea(areaId: string, chosen: string[], areas: Map<string, AreaInfo>) {
  const from = areas.get(areaId);
  if (!from) return null;
  let best: { area: AreaInfo; km: number } | null = null;
  for (const id of chosen) {
    const to = areas.get(id);
    if (!to) continue;
    const km = distanceKm(from, to);
    if (!best || km < best.km) best = { area: to, km };
  }
  return best;
}

// Area ids that count for a brief: the chosen ones plus every area whose center
// lies within `nearbyKm` of a chosen area's center.
export function areasWithinReach(chosen: string[], areas: Map<string, AreaInfo>): string[] {
  const reach = new Set(chosen);
  for (const [id] of areas) {
    const nearest = nearestChosenArea(id, chosen, areas);
    if (nearest && nearest.km <= nearbyKm) reach.add(id);
  }
  return [...reach];
}

function formatKm(km: number): string {
  const rounded = km < 1 ? Math.round(km * 10) / 10 : Math.round(km);
  return `${rounded} km`;
}

export function countCriteria(brief: Brief): number {
  return [
    brief.budgetMinBdt !== null || brief.budgetMaxBdt !== null,
    brief.areaIds.length > 0,
    brief.minBedrooms !== null,
    brief.propertyTypes.length > 0,
    brief.amenityIds.length > 0,
  ].filter(Boolean).length;
}

type Criterion = { weight: number; earned: number; why?: string; differs?: string };

function budgetCriterion(price: number, brief: Brief): Criterion | null {
  const { budgetMinBdt: min, budgetMaxBdt: max } = brief;
  if (min === null && max === null) return null;
  if (max !== null && price > max) {
    const share = 1 - (price - max) / (max * budgetSlack);
    return { weight: weights.budget, earned: weights.budget * Math.max(0, share), differs: `${formatPrice(price - max)} over your budget` };
  }
  if (min !== null && price < min) {
    const share = 1 - (min - price) / (min * budgetSlack);
    return { weight: weights.budget, earned: weights.budget * Math.max(0, share), differs: `${formatPrice(min - price)} under your budget` };
  }
  return { weight: weights.budget, earned: weights.budget, why: "Within your budget" };
}

function areaCriterion(listing: ScoredListing, brief: Brief, context: MatchContext): Criterion | null {
  if (brief.areaIds.length === 0) return null;
  const name = context.areas.get(listing.areaId)?.name ?? "another area";
  if (brief.areaIds.includes(listing.areaId)) return { weight: weights.areas, earned: weights.areas, why: `In ${name}` };
  const nearest = nearestChosenArea(listing.areaId, brief.areaIds, context.areas);
  const differs = nearest ? `In ${name}, ${formatKm(nearest.km)} from ${nearest.area.name}` : `In ${name}`;
  const earned = nearest && nearest.km <= nearbyKm ? 15 : 0;
  return { weight: weights.areas, earned, differs };
}

function bedroomsCriterion(bedrooms: number | null, brief: Brief): Criterion | null {
  const wanted = brief.minBedrooms;
  if (wanted === null) return null;
  if (bedrooms !== null && bedrooms >= wanted) {
    return { weight: weights.bedrooms, earned: weights.bedrooms, why: pluralize(bedrooms, "bedroom") };
  }
  const differs =
    bedrooms === null ? `Bedrooms not listed, you asked for ${wanted}` : `${pluralize(bedrooms, "bedroom")}, you asked for ${wanted}`;
  return { weight: weights.bedrooms, earned: bedrooms === wanted - 1 ? 5 : 0, differs };
}

function typeCriterion(type: PropertyType, brief: Brief): Criterion | null {
  if (brief.propertyTypes.length === 0) return null;
  const label = propertyTypeLabels[type];
  if (brief.propertyTypes.includes(type)) return { weight: weights.type, earned: weights.type, why: label };
  return { weight: weights.type, earned: 0, differs: `${label}, not the type you asked for` };
}

function amenitiesCriterion(listing: ScoredListing, brief: Brief, context: MatchContext): Criterion | null {
  const wanted = [...new Set(brief.amenityIds)];
  if (wanted.length === 0) return null;
  const has = new Set(listing.amenityIds);
  const label = (id: string) => (context.amenityLabels.get(id) ?? "amenity").toLowerCase();
  const present = wanted.filter((id) => has.has(id));
  const missing = wanted.filter((id) => !has.has(id));
  return {
    weight: weights.amenities,
    earned: (weights.amenities * present.length) / wanted.length,
    why: present.length > 0 ? `Has ${present.map(label).join(", ")}` : undefined,
    differs: missing.length > 0 ? `No ${missing.map(label).join(", ")}` : undefined,
  };
}

// `score` is the whole percent even when `matchPercent` is hidden (fewer than 2
// criteria), so ranking never depends on what is displayed.
export function matchScore(listing: ScoredListing, brief: Brief, context: MatchContext): MatchResult & { score: number } {
  const criteria = [
    budgetCriterion(listing.priceBdt, brief),
    areaCriterion(listing, brief, context),
    bedroomsCriterion(listing.bedrooms, brief),
    typeCriterion(listing.propertyType, brief),
    amenitiesCriterion(listing, brief, context),
  ].filter((c): c is Criterion => c !== null);

  const total = criteria.reduce((sum, c) => sum + c.weight, 0);
  const earned = criteria.reduce((sum, c) => sum + c.earned, 0);
  const exact = criteria.every((c) => c.earned >= c.weight);

  const score = total === 0 ? 100 : Math.round((earned / total) * 100);
  return {
    score,
    matchPercent: criteria.length < 2 ? null : score,
    exact,
    // `why` is set only for a met criterion (or the amenities that are present).
    why: criteria.flatMap((c) => (c.why ? [c.why] : [])).slice(0, 3),
    differs: criteria.flatMap((c) => (c.differs ? [c.differs] : [])),
  };
}

// Ranks candidates: exact matches first, then percent, then newest, then id.
export function rankMatches(listings: ScoredListing[], brief: Brief, context: MatchContext): MatchCard[] {
  const scored = listings.map((listing) => ({ listing, result: matchScore(listing, brief, context) }));
  scored.sort(
    (a, b) =>
      Number(b.result.exact) - Number(a.result.exact) ||
      b.result.score - a.result.score ||
      b.listing.publishedAt.localeCompare(a.listing.publishedAt) ||
      (a.listing.id < b.listing.id ? -1 : a.listing.id > b.listing.id ? 1 : 0),
  );
  return scored.map(({ listing, result }) => ({
    listingId: listing.id,
    refCode: listing.refCode,
    matchPercent: result.matchPercent,
    exact: result.exact,
    why: result.why,
    differs: result.differs,
  }));
}
