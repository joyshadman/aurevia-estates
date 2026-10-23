import { formatPrice } from "@/lib/format";
import type { PropertyType } from "@/lib/domain/listing-card";

// The match score (spec 0006, AC-5). Pure and deterministic: the same listing
// and brief always give the same score, and the model never computes it.

export type BriefCriteria = {
  budgetMinBdt: number | null;
  budgetMaxBdt: number | null;
  propertyTypes: PropertyType[];
  areaIds: string[];
  amenityIds: string[];
  minBedrooms: number | null;
};

export type ScoredListing = {
  id: string;
  refCode: string;
  propertyType: PropertyType;
  priceBdt: number;
  areaId: string;
  bedrooms: number | null;
  amenityIds: string[];
  publishedAt: Date | null;
};

export type ScoreContext = {
  areas: Map<string, { nameEn: string; centerLat: number; centerLng: number }>;
  amenityLabels: Map<string, string>;
};

export type MatchCard = {
  listingId: string;
  refCode: string;
  matchPercent: number | null;
  exact: boolean;
  why: string[];
  differs: string[];
};

// How far a close match may stretch past a brief (also the candidate filter).
export const budgetSlack = 0.15;
export const nearbyAreaKm = 3;

const weights = { budget: 35, areas: 25, bedrooms: 15, type: 10, amenities: 15 } as const;
const nearbyAreaPoints = 15;
const oneBedroomShortPoints = 5;
const maxWhy = 3;

const typeNames: Record<PropertyType, string> = {
  APARTMENT: "An apartment",
  DUPLEX: "A duplex",
  VILLA: "A villa",
  HOUSE: "A house",
  PLOT: "A plot",
  COMMERCIAL: "A commercial property",
};

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// The chosen areas plus every area whose center is within `nearbyAreaKm` of a
// chosen area's center: the candidate search's area filter.
export function areasWithinReach(chosenIds: string[], areas: ScoreContext["areas"]): string[] {
  const chosen = chosenIds.map((id) => areas.get(id)).filter((area) => area !== undefined);
  return [...areas.entries()]
    .filter(([id, area]) => chosenIds.includes(id) || chosen.some((c) => distanceKm(c, area) <= nearbyAreaKm))
    .map(([id]) => id);
}

function distanceKm(a: { centerLat: number; centerLng: number }, b: { centerLat: number; centerLng: number }) {
  return haversineKm({ lat: a.centerLat, lng: a.centerLng }, { lat: b.centerLat, lng: b.centerLng });
}

function formatKm(km: number): string {
  return `${Number(km.toFixed(1))} km`;
}

// Linear from full points at the edge of the range down to 0 at 15% past it.
function budgetPoints(price: number, min: number | null, max: number | null): number {
  if (max !== null && price > max) return weights.budget * Math.max(0, 1 - (price - max) / (max * budgetSlack));
  if (min !== null && price < min) return weights.budget * Math.max(0, 1 - (min - price) / (min * budgetSlack));
  return weights.budget;
}

export function criteriaCount(brief: BriefCriteria): number {
  return [
    brief.budgetMinBdt !== null || brief.budgetMaxBdt !== null,
    brief.areaIds.length > 0,
    brief.minBedrooms !== null,
    brief.propertyTypes.length > 0,
    brief.amenityIds.length > 0,
  ].filter(Boolean).length;
}

export function matchScore(listing: ScoredListing, brief: BriefCriteria, context: ScoreContext) {
  let earned = 0;
  let possible = 0;
  let exact = true;
  const why: string[] = [];
  const differs: string[] = [];

  const add = (weight: number, points: number, full: boolean, met: string | null, unmet: string | null) => {
    possible += weight;
    earned += points;
    if (full) {
      if (met) why.push(met);
    } else {
      exact = false;
      if (unmet) differs.push(unmet);
    }
  };

  const { budgetMinBdt: min, budgetMaxBdt: max } = brief;
  if (min !== null || max !== null) {
    const over = max !== null && listing.priceBdt > max;
    const under = min !== null && listing.priceBdt < min;
    const unmet = over
      ? `${formatPrice(listing.priceBdt - max)} over your budget`
      : under
        ? `${formatPrice(min - listing.priceBdt)} under your minimum budget`
        : null;
    add(weights.budget, budgetPoints(listing.priceBdt, min, max), !over && !under, "Within your budget", unmet);
  }

  if (brief.areaIds.length > 0) {
    const area = context.areas.get(listing.areaId);
    const name = area?.nameEn ?? "another area";
    if (brief.areaIds.includes(listing.areaId)) {
      add(weights.areas, weights.areas, true, `In ${name}`, null);
    } else {
      const nearest = brief.areaIds
        .map((id) => context.areas.get(id))
        .filter((chosen) => chosen !== undefined && area !== undefined)
        .map((chosen) => ({ chosen: chosen!, km: distanceKm(area!, chosen!) }))
        .sort((a, b) => a.km - b.km)[0];
      const near = nearest !== undefined && nearest.km <= nearbyAreaKm;
      const unmet = near ? `In ${name}, ${formatKm(nearest.km)} from ${nearest.chosen.nameEn}` : `In ${name}`;
      add(weights.areas, near ? nearbyAreaPoints : 0, false, null, unmet);
    }
  }

  if (brief.minBedrooms !== null) {
    const beds = listing.bedrooms;
    const full = beds !== null && beds >= brief.minBedrooms;
    const points = full ? weights.bedrooms : beds === brief.minBedrooms - 1 ? oneBedroomShortPoints : 0;
    const unmet =
      beds === null ? `No bedrooms listed, you asked for ${brief.minBedrooms}` : `${beds} bedrooms, you asked for ${brief.minBedrooms}`;
    add(weights.bedrooms, points, full, `${beds} bedrooms`, unmet);
  }

  if (brief.propertyTypes.length > 0) {
    const full = brief.propertyTypes.includes(listing.propertyType);
    const name = typeNames[listing.propertyType];
    add(weights.type, full ? weights.type : 0, full, name, `${name}, not the type you asked for`);
  }

  if (brief.amenityIds.length > 0) {
    const label = (id: string) => context.amenityLabels.get(id) ?? "an amenity";
    const present = brief.amenityIds.filter((id) => listing.amenityIds.includes(id));
    const missing = brief.amenityIds.filter((id) => !listing.amenityIds.includes(id));
    const points = (weights.amenities * present.length) / brief.amenityIds.length;
    possible += weights.amenities;
    earned += points;
    if (present.length > 0) why.push(`Has ${present.map(label).join(", ")}`);
    if (missing.length > 0) {
      exact = false;
      differs.push(`No ${missing.map(label).join(", ")}`);
    }
  }

  const score = possible === 0 ? 100 : Math.round((earned / possible) * 100);
  return {
    score,
    card: {
      listingId: listing.id,
      refCode: listing.refCode,
      matchPercent: criteriaCount(brief) >= 2 ? score : null,
      exact,
      why: why.slice(0, maxWhy),
      differs,
    } satisfies MatchCard,
  };
}

// Exact matches first, then score, then newest, then id: a total order, so the
// same candidates always rank the same way.
export function rankMatches(listings: ScoredListing[], brief: BriefCriteria, context: ScoreContext): MatchCard[] {
  return listings
    .map((listing) => ({ listing, ...matchScore(listing, brief, context) }))
    .sort(
      (a, b) =>
        Number(b.card.exact) - Number(a.card.exact) ||
        b.score - a.score ||
        (b.listing.publishedAt?.getTime() ?? 0) - (a.listing.publishedAt?.getTime() ?? 0) ||
        (a.listing.id < b.listing.id ? -1 : a.listing.id > b.listing.id ? 1 : 0),
    )
    .map(({ card }) => card);
}
