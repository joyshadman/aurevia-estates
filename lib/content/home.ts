// Homepage copy (spec 0012, assumed). The agency may edit these words; every
// claim must stay true of what the site does. Statistics and testimonials are
// left out until the agency supplies real, confirmed figures and consented quotes.

export const homeCopy = {
  eyebrow: "Private residences · Sylhet",
  headline: "Homes framed by tea hills and quiet light.",
  lead: "From hillside villas in Tilagor to apartments above Zindabazar, every Aurevia listing is checked by our own advisors before it goes live.",
  assistantTitle: "Describe the home. We'll find the address.",
  assistantLead:
    "Tell the assistant your budget, neighbourhood, and how your family lives, in English or বাংলা. It searches every verified Aurevia listing and books a viewing with the right advisor.",
  examples: ["Which areas suit a family with school age kids?", "Villas with tea garden views", "জিন্দাবাজারে ফ্ল্যাট আছে?"],
  whyTitle: "Fewer listings. Every one of them checked by hand.",
  why: [
    { title: "Checked before it goes live", body: "An Aurevia agent completes every listing, from price to photos to the map pin, before buyers can see it." },
    { title: "Price per square foot, always", body: "Every home shows its price per square foot, so you can compare fairly at a glance." },
    { title: "An assistant that only shows real homes", body: "Ask in English or বাংলা. The assistant recommends only published Aurevia listings, never invented ones." },
    { title: "Advisors here in Sylhet", body: "Book a viewing in the chat, and your advisor confirms the time by phone or WhatsApp." },
  ],
} as const;
