import { describe, expect, it } from "vitest";
import { emptyBrief, type Brief } from "@/lib/domain/brief";
import { banglaShare, detectLocale, findListingCodes, findUngrounded, parseListingCode } from "@/lib/domain/chat-text";
import { areasWithinReach, distanceKm, matchScore, rankMatches, type MatchContext, type ScoredListing } from "@/lib/domain/match-score";

// Spec 0006: the match score (AC-5, AC-6) and the text rules (AC-8, AC-15).
// Pure functions, no database.

const context: MatchContext = {
  areas: new Map([
    ["shibgonj", { name: "Shibgonj", lat: 24.893, lng: 91.89 }],
    ["kumarpara", { name: "Kumarpara", lat: 24.8979, lng: 91.8757 }],
    ["khadim", { name: "Khadim", lat: 24.9184, lng: 91.9358 }],
  ]),
  amenityLabels: new Map([
    ["parking", "Car parking"],
    ["lift", "Lift"],
  ]),
};

const brief = (patch: Partial<Brief>): Brief => ({ ...emptyBrief, ...patch });

const listing = (patch: Partial<ScoredListing>): ScoredListing => ({
  id: "00000000-0000-7000-8000-000000000001",
  refCode: "AUR-1001",
  priceBdt: 20_000_000,
  propertyType: "APARTMENT",
  areaId: "shibgonj",
  bedrooms: 4,
  amenityIds: ["parking", "lift"],
  publishedAt: "2026-10-01T00:00:00.000Z",
  ...patch,
});

const family = brief({
  budgetMaxBdt: 25_000_000,
  areaIds: ["shibgonj"],
  minBedrooms: 4,
  amenityIds: ["parking"],
});

describe("matchScore", () => {
  it("gives an exact match 100% with up to 3 why facts", () => {
    const result = matchScore(listing({}), family, context);
    expect(result).toMatchObject({ matchPercent: 100, exact: true, differs: [] });
    expect(result.why).toEqual(["Within your budget", "In Shibgonj", "4 bedrooms"]);
  });

  it("explains a home one bedroom short", () => {
    const result = matchScore(listing({ bedrooms: 3 }), family, context);
    expect(result.exact).toBe(false);
    expect(result.differs).toEqual(["3 bedrooms, you asked for 4"]);
    // 35 + 25 + 5 + 15 out of 90.
    expect(result.matchPercent).toBe(89);
  });

  it("names the money over budget and scales the budget points", () => {
    const result = matchScore(listing({ priceBdt: 27_700_000 }), family, context);
    expect(result.differs).toEqual(["BDT 2,700,000 over your budget"]);
    expect(result.matchPercent).toBeLessThan(100);
    expect(result.matchPercent).toBeGreaterThan(60);
  });

  it("names a nearby area with its distance", () => {
    const result = matchScore(listing({ areaId: "kumarpara" }), family, context);
    expect(result.differs).toEqual(["In Kumarpara, 2 km from Shibgonj"]);
  });

  it("lists missing amenities", () => {
    const result = matchScore(listing({ amenityIds: ["lift"] }), brief({ amenityIds: ["parking", "lift"], minBedrooms: 2 }), context);
    expect(result.differs).toEqual(["No car parking"]);
    expect(result.why).toContain("Has lift");
  });

  it("hides the percent when the brief has fewer than 2 criteria", () => {
    expect(matchScore(listing({}), brief({ minBedrooms: 3 }), context).matchPercent).toBeNull();
  });

  it("is deterministic", () => {
    const a = matchScore(listing({ priceBdt: 26_000_000, bedrooms: 3 }), family, context);
    const b = matchScore(listing({ priceBdt: 26_000_000, bedrooms: 3 }), family, context);
    expect(a).toEqual(b);
  });
});

describe("rankMatches", () => {
  it("puts exact matches first, then by percent, then newest", () => {
    const ranked = rankMatches(
      [
        listing({ id: "c", refCode: "AUR-3", bedrooms: 3 }),
        listing({ id: "a", refCode: "AUR-1", publishedAt: "2026-09-01T00:00:00.000Z" }),
        listing({ id: "b", refCode: "AUR-2", publishedAt: "2026-10-05T00:00:00.000Z" }),
      ],
      family,
      context,
    );
    expect(ranked.map((card) => card.refCode)).toEqual(["AUR-2", "AUR-1", "AUR-3"]);
    expect(ranked[2]).toMatchObject({ exact: false, differs: ["3 bedrooms, you asked for 4"] });
  });
});

describe("areas within reach", () => {
  it("adds areas whose center is within 3 km", () => {
    expect(distanceKm(context.areas.get("shibgonj")!, context.areas.get("kumarpara")!)).toBeLessThan(3);
    expect(areasWithinReach(["shibgonj"], context.areas).sort()).toEqual(["kumarpara", "shibgonj"]);
  });
});

describe("chat text rules", () => {
  it("detects the reply language from the script", () => {
    expect(detectLocale("আমি একটি ফ্ল্যাট খুঁজছি", "en")).toBe("bn");
    expect(detectLocale("ami ekta flat khujchi", "bn")).toBe("en");
    expect(detectLocale("2", "bn")).toBe("bn");
    expect(detectLocale("🏠", "en")).toBe("en");
    expect(banglaShare("")).toBeNull();
  });

  it("finds listing codes, also in Bangla digits", () => {
    expect(findListingCodes("See aur-1042 and AUR-১০৪৩.")).toEqual(["AUR-1042", "AUR-1043"]);
    expect(parseListingCode(" aur১০৪২ ")).toBe("AUR-1042");
    expect(parseListingCode("1042")).toBeNull();
  });

  it("flags unshown codes and long titles, not short ones", () => {
    const others = [
      { refCode: "AUR-2000", title: "Garden View Duplex in Shibgonj" },
      { refCode: "AUR-2001", title: "Shibgonj Flat" },
    ];
    expect(findUngrounded("Try AUR-1042 or AUR-১০৪৩.", new Set(["AUR-1042"]), [])).toEqual(["AUR-1043"]);
    expect(findUngrounded("The garden view duplex in Shibgonj is lovely.", new Set(), others)).toEqual(["AUR-2000"]);
    expect(findUngrounded("A Shibgonj flat could work.", new Set(), others)).toEqual([]);
  });
});
