import { getCountries, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

// The phone country select (spec 0004, *Value sourcing*): every country
// libphonenumber knows, named in English, sorted by name, Bangladesh first.
export type CountryOption = { code: CountryCode; name: string };

export function countryOptions(): CountryOption[] {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const all = getCountries()
    .map((code) => ({ code, name: names.of(code) ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  const bd = all.find((country) => country.code === "BD");
  return bd ? [bd, ...all.filter((country) => country.code !== "BD")] : all;
}

// A saved E.164 number back into the form's country and national number.
export function splitPhone(e164: string | null): { countryCode: CountryCode; national: string } {
  const number = e164 ? parsePhoneNumberFromString(e164) : undefined;
  return { countryCode: number?.country ?? "BD", national: number?.formatNational() ?? "" };
}
