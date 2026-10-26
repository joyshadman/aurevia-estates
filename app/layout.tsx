import type { Metadata } from "next";
import { Analytics } from "@/components/chrome/analytics";
import { ConsentBanner } from "@/components/chrome/consent-banner";
import { SiteFooter } from "@/components/chrome/site-footer";
import { SiteHeader } from "@/components/chrome/site-header";
import { Toaster } from "@/components/ui/toast";
import { themeInitScript } from "@/lib/theme";
import { SavedHomesProvider } from "./saved/save-home";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Aurevia Estates · Sylhet",
    template: "%s · Aurevia Estates",
  },
  description: "Hand checked homes across Sylhet, matched to your family by the Aurevia Assistant.",
};

// Fonts load from Google Fonts by link, as chosen in spec 0003 (privacy note for
// feature 17). The theme script runs before first paint (no flash).
const fontsHref =
  "https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600&family=Inter:wght@400;500;600&family=Playfair+Display:wght@400;500;600&display=swap";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="light" data-theme-pref="system" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={fontsHref} />
      </head>
      <body className="flex min-h-screen flex-col">
        <SavedHomesProvider>
          <SiteHeader />
          <main id="main" className="flex flex-1 flex-col">
            {children}
          </main>
          <SiteFooter />
        </SavedHomesProvider>
        <Toaster />
        {/* Spec 0017 and 0018: the cookie card, and analytics only after consent. */}
        <ConsentBanner />
        <Analytics />
      </body>
    </html>
  );
}
