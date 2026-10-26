// The agency's public contact details (spec 0015, AC-5). Each value stays null
// until the agency confirms it; the about page hides a line while it is null,
// so nothing invented ships. Fill these in, in one place.

export type AgencyDetails = {
  // e.g. "Level 6, Al Hamra Shopping City, Zindabazar, Sylhet 3100"
  officeAddress: string | null;
  // One line per range, e.g. ["Saturday to Thursday, 10:00 AM to 7:00 PM", "Friday by appointment"]
  hours: string[] | null;
  // E.164, e.g. "+8801711204580"
  phone: string | null;
  // E.164 of the agency's WhatsApp number
  whatsapp: string | null;
  email: string | null;
  // Coordinates for "Open in Google Maps"
  officeLocation: { latitude: number; longitude: number } | null;
};

export const agency: AgencyDetails = {
  officeAddress: null,
  hours: null,
  phone: null,
  whatsapp: null,
  email: null,
  officeLocation: null,
};
