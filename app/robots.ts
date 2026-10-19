import type { MetadataRoute } from "next";
import { serverEnv } from "@/lib/server/env";
import { siteUrl } from "@/lib/server/sign-in";

// Robots rules (spec 0015, assumed). Signed in, agent, and API paths stay out;
// a preview deploy is kept out of search entirely.
export default function robots(): MetadataRoute.Robots {
  const site = siteUrl();
  const env = serverEnv().VERCEL_ENV;
  if (env && env !== "production") return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account", "/saved", "/assistant", "/dashboard", "/sign-in", "/mfa", "/auth", "/api", "/styleguide"],
    },
    sitemap: `${site}/sitemap.xml`,
  };
}
