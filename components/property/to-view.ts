import type { PreviewListing, PublicListing } from "@/lib/server/public-listings";
import type { PropertyViewModel } from "./view-model";

export function publicView(listing: PublicListing, sold: boolean): PropertyViewModel {
  return {
    mode: "public",
    id: listing.id,
    sold,
    status: listing.status,
    slug: listing.slug,
    refCode: listing.refCode,
    propertyType: listing.propertyType,
    title: listing.title,
    description: listing.description,
    priceBdt: listing.priceBdt,
    priceNegotiable: listing.priceNegotiable,
    pricePerSqft: listing.pricePerSqft,
    areaName: listing.area.nameEn,
    areaSlug: listing.area.slug,
    addressLine: listing.addressLine,
    latitude: listing.latitude,
    longitude: listing.longitude,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    builtUpSqft: listing.builtUpSqft,
    landKatha: listing.landKatha,
    floorNumber: listing.floorNumber,
    totalFloors: listing.totalFloors,
    parkingSpaces: listing.parkingSpaces,
    completionStatus: listing.completionStatus,
    handoverDate: listing.handoverDate,
    amenities: listing.amenities.map((a) => ({ id: a.id, label: a.label })),
    nearbyPlaces: listing.nearbyPlaces,
    photos: listing.photos.map((p) => ({ id: p.id, url: p.url, alt: p.alt, width: p.width, height: p.height })),
    advisor: listing.advisor,
  };
}

export function previewView(listing: PreviewListing): PropertyViewModel {
  return {
    ...listing,
    mode: "preview",
    sold: listing.status === "SOLD",
    areaName: listing.area.nameEn,
    areaSlug: listing.area.slug,
  };
}
