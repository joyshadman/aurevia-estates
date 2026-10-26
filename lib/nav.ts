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
  { label: "Buy", href: "/properties", live: true, placement: ["header", "footer"] }, // feature 11
  { label: "Explore map", href: "/properties?view=map", live: true, placement: ["header"] }, // feature 13
  { label: "Sell", href: "/about#contact", live: true, placement: ["header", "footer"] }, // feature 15
  { label: "AI Assistant", href: routes.assistant, live: true, placement: ["header", "footer"] },
  { label: "About & contact", href: "/about", live: true, placement: ["header", "footer"] }, // feature 15
  { label: "Saved homes", href: "/saved", live: true, placement: ["account"] }, // feature 14
  { label: "Account settings", href: routes.account, live: true, placement: ["account"] },
  { label: "Privacy", href: "/privacy", live: true, placement: ["footer"] }, // feature 17
  { label: "Terms", href: "/terms", live: true, placement: ["footer"] }, // feature 17
];

export function liveNav(placement: NavPlacement): NavEntry[] {
  return nav.filter((entry) => entry.live && entry.placement.includes(placement));
}
