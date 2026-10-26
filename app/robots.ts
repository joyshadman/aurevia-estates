import type { MetadataRoute } from "next";
import { absoluteUrl, privatePaths } from "@/lib/seo";

// `/robots.txt` (spec 0016, AC-2): everything public is crawlable; signed in
// areas, sign in, and the API are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: privatePaths },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
