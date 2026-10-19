// About page copy and office details (spec 0014, assumed). Real data only: every
// sentence must stay true of what the site does, with no invented history,
// people, figures, or quotes. The agency fills the office details; each one
// renders only once it is set.

export const aboutCopy = {
  eyebrow: "About Aurevia",
  headline: "A Sylhet agency that checks every home by hand.",
  lead: "Aurevia lists fewer homes, and an advisor here in Sylhet completes each one, from the price to the photos to the map pin, before any buyer sees it.",
  storyTitle: "How we work",
  story: [
    "Buying a home is easier when you can trust what you read. So every Aurevia listing shows its real price, its price per square foot, and the facts an advisor has confirmed, with nothing filled in by guesswork.",
    "Families abroad and buyers here in Sylhet get the same answers. The Aurevia Assistant searches only published Aurevia homes, in English or বাংলা, and books a viewing with the advisor who knows the home.",
  ],
  missionTitle: "What you can count on",
  values: [
    { title: "Checked before it goes live", body: "An Aurevia advisor completes every listing before it is published." },
    { title: "Prices you can compare", body: "Every home shows its asking price and its price per square foot." },
    { title: "Real homes only", body: "The assistant recommends published Aurevia listings, never invented ones." },
    { title: "Advisors in Sylhet", body: "Your advisor confirms each viewing by phone or WhatsApp." },
  ],
  advisorsTitle: "Our advisors",
  advisorsLead: "The people who list each home and show it to you.",
  contactTitle: "Visit us, call, or send a note.",
  contactLead: "Tell us what you're looking for, or what you'd like to sell, and an advisor will get back to you.",
} as const;

// TODO(agency): fill these before launch. `null` hides the line.
export const office: {
  address: string | null;
  hours: string[] | null;
  phone: string | null;
  email: string | null;
  // Digits only, with the country code (e.g. 8801XXXXXXXXX), for wa.me links.
  whatsapp: string | null;
  // A Google Maps link to the office.
  mapsUrl: string | null;
} = {
  address: null,
  hours: null,
  phone: null,
  email: null,
  whatsapp: null,
  mapsUrl: null,
};
