// Site navigation (spec 0003). Each feature flips its own entry to `live: true`;
// only live entries render. Paths other features own live in `routes`.

export const routes = {
  home: "/",
  assistant: "/assistant",
  signIn: "/sign-in",
  dashboard: "/dashboard",
  account: "/account",
} as const;

export type NavPlacement = "header" | "footer" | "account";

export type NavEntry = {
  label: string;
  href: string;
  live: boolean;
  placement: NavPlacement[];
};

export const nav: NavEntry[] = [
  { label: "Buy", href: "/properties", live: true, placement: ["header", "footer"] }, // feature 11 (spec 0010)
  { label: "Explore map", href: "/properties?view=map", live: false, placement: ["header"] }, // feature 13
  { label: "Sell", href: "/about#contact", live: false, placement: ["header", "footer"] }, // feature 15
  { label: "AI Assistant", href: routes.assistant, live: true, placement: ["header", "footer"] },
  { label: "About & contact", href: "/about", live: false, placement: ["header", "footer"] }, // feature 15
  { label: "Saved homes", href: "/saved", live: false, placement: ["account"] }, // feature 14
  { label: "Privacy", href: "/privacy", live: false, placement: ["footer"] }, // feature 17
  { label: "Terms", href: "/terms", live: false, placement: ["footer"] }, // feature 17
];

export function liveNav(placement: NavPlacement): NavEntry[] {
  return nav.filter((entry) => entry.live && entry.placement.includes(placement));
}
