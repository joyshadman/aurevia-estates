import { jsonLdString } from "@/lib/domain/structured-data";

// Structured data as a script tag in the page (spec 0015).
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
