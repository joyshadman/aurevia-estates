// Reference and sample data for `prisma db seed` (spec 0002, AC-2).
// Areas and amenities load on every environment. The sample agent and listings
// load only with `--sample`; they mirror the mockups in `desing-check/`.

export const areas = [
  { slug: "zindabazar", nameEn: "Zindabazar", nameBn: "জিন্দাবাজার", centerLat: 24.8955, centerLng: 91.8697 },
  { slug: "uposhohor", nameEn: "Uposhohor", nameBn: "উপশহর", centerLat: 24.8873, centerLng: 91.8851 },
  { slug: "tilagor", nameEn: "Tilagor", nameBn: "টিলাগড়", centerLat: 24.8965, centerLng: 91.8963 },
  { slug: "kumarpara", nameEn: "Kumarpara", nameBn: "কুমারপাড়া", centerLat: 24.8979, centerLng: 91.8757 },
  { slug: "mirabazar", nameEn: "Mirabazar", nameBn: "মিরাবাজার", centerLat: 24.8915, centerLng: 91.882 },
  { slug: "ambarkhana", nameEn: "Ambarkhana", nameBn: "আম্বরখানা", centerLat: 24.9067, centerLng: 91.8678 },
  { slug: "bagbari", nameEn: "Bagbari", nameBn: "বাগবাড়ি", centerLat: 24.9036, centerLng: 91.8829 },
  { slug: "khadim", nameEn: "Khadim", nameBn: "খাদিম", centerLat: 24.9184, centerLng: 91.9358 },
  { slug: "airport-road", nameEn: "Airport Road", nameBn: "এয়ারপোর্ট রোড", centerLat: 24.929, centerLng: 91.87 },
  { slug: "shibgonj", nameEn: "Shibgonj", nameBn: "শিবগঞ্জ", centerLat: 24.893, centerLng: 91.89 },
].map((area, index) => ({ ...area, sortOrder: index }));

// `icon` is a lucide icon name.
export const amenities = [
  { slug: "generator-backup", label: "Full generator backup", labelBn: "জেনারেটর ব্যাকআপ", icon: "zap" },
  { slug: "gas-line", label: "Jalalabad gas line", labelBn: "গ্যাস লাইন", icon: "flame" },
  { slug: "lift", label: "Lift", labelBn: "লিফট", icon: "arrow-up-down" },
  { slug: "swimming-pool", label: "Swimming pool", labelBn: "সুইমিং পুল", icon: "waves" },
  { slug: "rooftop-garden", label: "Rooftop garden", labelBn: "ছাদ বাগান", icon: "sprout" },
  { slug: "gated-security", label: "24-hour gated security", labelBn: "২৪ ঘণ্টা নিরাপত্তা", icon: "shield-check" },
  { slug: "car-parking", label: "Car parking", labelBn: "গাড়ি পার্কিং", icon: "car" },
  { slug: "cctv", label: "CCTV", labelBn: "সিসিটিভি", icon: "cctv" },
  { slug: "gym", label: "Gym", labelBn: "জিম", icon: "dumbbell" },
  { slug: "community-hall", label: "Community hall", labelBn: "কমিউনিটি হল", icon: "users" },
  { slug: "kids-play-area", label: "Kids' play area", labelBn: "শিশুদের খেলার জায়গা", icon: "toy-brick" },
  { slug: "deep-tube-well", label: "Deep tube well", labelBn: "গভীর নলকূপ", icon: "droplets" },
].map((amenity, index) => ({ ...amenity, sortOrder: index }));

// Fixed id so reruns find the same row. It has no auth user and cannot sign in.
export const sampleAgent = {
  id: "0199f000-0000-7000-8000-000000000a01",
  role: "AGENT" as const,
  email: "sample.agent@aurevia.example",
  fullName: "Farhana Rahman",
  phone: "+8801700000001",
  agentTitle: "Senior property advisor",
  agentWhatsapp: "+8801700000001",
  agentBio: "Sample agent for local development. Not a real person.",
  agentPhotoUrl: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=400&q=80",
  agentIsPublic: true,
};

const photo = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=80`;

const photos = {
  villa: photo("1580587771525-78b9dba3b914"),
  modern: photo("1564013799919-ab600027ffc6"),
  house: photo("1512917774080-9991f1c4c750"),
  apartment: photo("1545324418-cc1a3fa10c00"),
  living: photo("1600210492486-724fe5c67fb0"),
  interior: photo("1600566753190-17f0baa2a6c3"),
  kitchen: photo("1484154218962-a197022b5858"),
  room: photo("1522708323590-d24dbb6b0267"),
  bright: photo("1502672260266-1c1ef2d93688"),
};

const description = (lead: string) =>
  `${lead} Verified title, SCC approved plan, and a dedicated Aurevia advisor. Viewings available this weekend.`;

export type SampleListing = {
  refCode: string;
  title: string;
  areaSlug: string;
  propertyType: "APARTMENT" | "DUPLEX" | "VILLA" | "HOUSE" | "PLOT" | "COMMERCIAL";
  priceBdt: number;
  priceNegotiable?: boolean;
  addressLine: string;
  latitude: number;
  longitude: number;
  bedrooms?: number;
  bathrooms?: number;
  builtUpSqft?: number;
  landKatha?: number;
  floorNumber?: number;
  totalFloors?: number;
  parkingSpaces?: number;
  completionStatus?: "READY" | "UNDER_CONSTRUCTION";
  handoverDate?: string;
  description: string;
  amenitySlugs: string[];
  photoUrls: string[];
  publishedAt: string;
};

export const sampleListings: SampleListing[] = [
  {
    refCode: "AUR-1001",
    title: "The Malnicherra Residence",
    areaSlug: "airport-road",
    propertyType: "VILLA",
    priceBdt: 65_000_000,
    addressLine: "Airport Road, near Malnicherra Tea Estate, Sylhet",
    latitude: 24.9312,
    longitude: 91.8723,
    bedrooms: 6,
    bathrooms: 6,
    builtUpSqft: 6200,
    landKatha: 8,
    totalFloors: 3,
    parkingSpaces: 3,
    completionStatus: "READY",
    description: description("A tea garden villa with a wide lawn and views over Malnicherra."),
    amenitySlugs: ["generator-backup", "gas-line", "swimming-pool", "gated-security", "car-parking", "cctv"],
    photoUrls: [photos.villa, photos.living, photos.kitchen],
    publishedAt: "2026-10-10T09:00:00.000Z",
  },
  {
    refCode: "AUR-1002",
    title: "Tilagor Hillside Villa",
    areaSlug: "tilagor",
    propertyType: "VILLA",
    priceBdt: 48_000_000,
    addressLine: "Road 3, Tilagor, Sylhet",
    latitude: 24.8971,
    longitude: 91.8989,
    bedrooms: 5,
    bathrooms: 5,
    builtUpSqft: 4600,
    landKatha: 6.5,
    totalFloors: 2,
    parkingSpaces: 2,
    completionStatus: "READY",
    description: description("A quiet hillside villa with a rooftop garden and a private drive."),
    amenitySlugs: ["generator-backup", "gas-line", "rooftop-garden", "gated-security", "car-parking"],
    photoUrls: [photos.modern, photos.interior, photos.room],
    publishedAt: "2026-10-09T09:00:00.000Z",
  },
  {
    refCode: "AUR-1003",
    title: "Kumarpara Modern Duplex",
    areaSlug: "kumarpara",
    propertyType: "DUPLEX",
    priceBdt: 37_500_000,
    addressLine: "Kumarpara Main Road, Sylhet",
    latitude: 24.8983,
    longitude: 91.8762,
    bedrooms: 5,
    bathrooms: 4,
    builtUpSqft: 4100,
    landKatha: 4,
    totalFloors: 2,
    parkingSpaces: 1,
    completionStatus: "READY",
    description: description("A two storey modern duplex a short walk from Kumarpara market."),
    amenitySlugs: ["generator-backup", "gas-line", "car-parking", "cctv"],
    photoUrls: [photos.house, photos.living, photos.kitchen],
    publishedAt: "2026-10-08T09:00:00.000Z",
  },
  {
    refCode: "AUR-1004",
    title: "Surma Sky Penthouse",
    areaSlug: "zindabazar",
    propertyType: "APARTMENT",
    priceBdt: 32_000_000,
    addressLine: "14th floor, Zindabazar, Sylhet",
    latitude: 24.8949,
    longitude: 91.8687,
    bedrooms: 4,
    bathrooms: 4,
    builtUpSqft: 3400,
    floorNumber: 14,
    totalFloors: 14,
    parkingSpaces: 2,
    completionStatus: "READY",
    description: description("A top floor penthouse with a wraparound terrace over the Surma."),
    amenitySlugs: ["generator-backup", "lift", "rooftop-garden", "gated-security", "car-parking", "gym"],
    photoUrls: [photos.apartment, photos.interior, photos.bright],
    publishedAt: "2026-10-07T09:00:00.000Z",
  },
  {
    refCode: "AUR-1005",
    title: "Mirabazar Courtyard House",
    areaSlug: "mirabazar",
    propertyType: "HOUSE",
    priceBdt: 26_000_000,
    priceNegotiable: true,
    addressLine: "Mirabazar, near Kin Bridge, Sylhet",
    latitude: 24.8909,
    longitude: 91.8814,
    bedrooms: 5,
    bathrooms: 4,
    builtUpSqft: 3400,
    landKatha: 5,
    totalFloors: 2,
    parkingSpaces: 1,
    completionStatus: "READY",
    description: description("A family house around a shaded inner courtyard, close to Kin Bridge."),
    amenitySlugs: ["gas-line", "car-parking", "deep-tube-well"],
    photoUrls: [photos.house, photos.room, photos.kitchen],
    publishedAt: "2026-10-06T09:00:00.000Z",
  },
  {
    refCode: "AUR-1006",
    title: "Shibgonj Garden House",
    areaSlug: "shibgonj",
    propertyType: "HOUSE",
    priceBdt: 21_500_000,
    addressLine: "Lane 7, Shibgonj, Sylhet",
    latitude: 24.8936,
    longitude: 91.8911,
    bedrooms: 4,
    bathrooms: 3,
    builtUpSqft: 3050,
    landKatha: 4.5,
    totalFloors: 2,
    parkingSpaces: 1,
    completionStatus: "UNDER_CONSTRUCTION",
    handoverDate: "2027-06-30",
    description: description("A new garden house with a fruit tree yard, handing over mid 2027."),
    amenitySlugs: ["gas-line", "rooftop-garden", "car-parking"],
    photoUrls: [photos.modern, photos.bright, photos.living],
    publishedAt: "2026-10-05T09:00:00.000Z",
  },
  {
    refCode: "AUR-1007",
    title: "Uposhohor Garden Residence",
    areaSlug: "uposhohor",
    propertyType: "APARTMENT",
    priceBdt: 18_500_000,
    addressLine: "Block D, Uposhohor, Sylhet",
    latitude: 24.8868,
    longitude: 91.8862,
    bedrooms: 4,
    bathrooms: 3,
    builtUpSqft: 2350,
    floorNumber: 5,
    totalFloors: 9,
    parkingSpaces: 1,
    completionStatus: "READY",
    description: description("A bright family apartment in Block D with a kids' play area downstairs."),
    amenitySlugs: ["generator-backup", "gas-line", "lift", "gated-security", "kids-play-area", "community-hall"],
    photoUrls: [photos.apartment, photos.living, photos.room],
    publishedAt: "2026-10-04T09:00:00.000Z",
  },
  {
    refCode: "AUR-1008",
    title: "Ambarkhana Executive Suite",
    areaSlug: "ambarkhana",
    propertyType: "APARTMENT",
    priceBdt: 14_500_000,
    addressLine: "Airport Road, Ambarkhana, Sylhet",
    latitude: 24.9071,
    longitude: 91.8683,
    bedrooms: 3,
    bathrooms: 3,
    builtUpSqft: 1850,
    floorNumber: 7,
    totalFloors: 10,
    parkingSpaces: 1,
    completionStatus: "READY",
    description: description("A furnished executive apartment near Ambarkhana point."),
    amenitySlugs: ["generator-backup", "lift", "gated-security", "cctv", "gym"],
    photoUrls: [photos.interior, photos.bright, photos.kitchen],
    publishedAt: "2026-10-03T09:00:00.000Z",
  },
  {
    refCode: "AUR-1009",
    title: "Bagbari Lakeview Apartment",
    areaSlug: "bagbari",
    propertyType: "APARTMENT",
    priceBdt: 12_000_000,
    addressLine: "Bagbari, near Dighirpar, Sylhet",
    latitude: 24.9041,
    longitude: 91.8834,
    bedrooms: 3,
    bathrooms: 2,
    builtUpSqft: 1750,
    floorNumber: 3,
    totalFloors: 8,
    parkingSpaces: 1,
    completionStatus: "UNDER_CONSTRUCTION",
    handoverDate: "2027-03-31",
    description: description("A lake facing apartment by Dighirpar, handing over early 2027."),
    amenitySlugs: ["generator-backup", "gas-line", "lift", "car-parking"],
    photoUrls: [photos.bright, photos.room, photos.living],
    publishedAt: "2026-10-02T09:00:00.000Z",
  },
  {
    refCode: "AUR-1010",
    title: "Khadim Hill Plot",
    areaSlug: "khadim",
    propertyType: "PLOT",
    priceBdt: 9_500_000,
    priceNegotiable: true,
    addressLine: "Khadimnagar, off Sylhet Tamabil Road, Sylhet",
    latitude: 24.9191,
    longitude: 91.9342,
    landKatha: 10,
    description: description("A level residential plot among the tea hills, with road access and power nearby."),
    amenitySlugs: [],
    photoUrls: [photos.villa],
    publishedAt: "2026-10-01T09:00:00.000Z",
  },
];
