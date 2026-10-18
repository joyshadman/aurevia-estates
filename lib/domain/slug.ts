// Listing slugs (spec 0002): `<slugified title>-aur-1042`, fixed at creation.

const maxTitleLength = 60;

// ASCII only, lowercase, words joined by `-`, capped at 60 characters.
// Falls back to `listing` when nothing ASCII is left (a Bangla only title).
export function slugifyTitle(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxTitleLength)
    .replace(/-+$/, "");
  return slug || "listing";
}

export function refCodeFor(sequenceValue: number | bigint): string {
  return `AUR-${sequenceValue}`;
}

export function listingSlug(title: string, refCode: string): string {
  return `${slugifyTitle(title)}-${refCode.toLowerCase()}`;
}
