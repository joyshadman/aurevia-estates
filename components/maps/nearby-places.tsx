import { Bus, GraduationCap, Hospital, Landmark, MapPin, MoonStar, ShoppingBag, Store, Trees, type LucideIcon } from "lucide-react";
import { placeKindLabels, travelText, type NearbyPlace, type PlaceKind } from "@/lib/maps";

// "Around the address" (spec 0011, AC-5): the agent's places, in their order.

const icons: Record<PlaceKind, LucideIcon> = {
  SCHOOL: GraduationCap,
  HEALTH: Hospital,
  MOSQUE: MoonStar,
  MARKET: Store,
  SHOPPING: ShoppingBag,
  PARK: Trees,
  TRANSPORT: Bus,
  LANDMARK: Landmark,
  OTHER: MapPin,
};

export function NearbyPlaces({ places }: { places: NearbyPlace[] }) {
  if (places.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-medium text-fg">Around the address</h3>
      <ul className="mt-3 flex flex-col gap-3">
        {places.map((place) => {
          const Icon = icons[place.kind];
          return (
            <li key={place.name} className="flex items-start gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-subtle text-accent-subtle-fg">
                <Icon aria-hidden="true" strokeWidth={1.6} className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-fg">
                  {place.name}
                  <span className="sr-only">, {placeKindLabels[place.kind]}</span>
                </p>
                <p className="text-xs text-fg-muted">{travelText(place)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
