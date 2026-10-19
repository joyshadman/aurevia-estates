import { PropertyCard } from "@/components/listing/property-card";
import type { PropertyType } from "@/lib/domain/listing-card";
import { getSimilarListings } from "@/lib/server/public-listings";

const taka = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

// "You may also consider" (spec 0009, AC-5). Hidden when there are none.
export async function SimilarHomes(props: { id: string; propertyType: PropertyType; areaId: string; priceBdt: number }) {
  const homes = await getSimilarListings(props.id, props.propertyType, props.areaId, props.priceBdt);
  if (homes.length === 0) return null;
  return (
    <section aria-labelledby="similar-homes" className="mt-16 border-t border-line pt-10">
      <h2 id="similar-homes" className="font-display text-2xl text-fg">
        You may also consider
      </h2>
      <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {homes.map((home) => (
          <li key={home.slug}>
            <PropertyCard
              listing={home}
              href={`/properties/${home.slug}`}
              footer={home.pricePerSqft !== null ? <p className="text-xs text-fg-subtle">BDT {taka.format(home.pricePerSqft)} / sqft</p> : undefined}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
