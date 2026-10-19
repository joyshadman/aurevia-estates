import { propertyTypeLabels } from "@/lib/domain/listing-card";
import { formatKatha, formatSqft } from "@/lib/format";
import type { PropertyViewModel } from "./view-model";

const month = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "Asia/Dhaka" });

const floor = (n: number) => (n === 0 ? "Ground" : String(n));

// Only stored values, each row hidden when empty (spec 0009, AC-13).
export function SpecsTable({ view }: { view: PropertyViewModel }) {
  const completion =
    view.completionStatus === "READY"
      ? "Ready to move"
      : view.completionStatus === "UNDER_CONSTRUCTION"
        ? `Under construction${view.handoverDate ? `, handover ${month.format(new Date(`${view.handoverDate}T00:00:00Z`))}` : ""}`
        : null;
  const rows: [string, string | null][] = [
    ["Property type", propertyTypeLabels[view.propertyType]],
    ["Completion", completion],
    ["Built up area", view.builtUpSqft !== null ? formatSqft(view.builtUpSqft) : null],
    ["Land", view.landKatha !== null ? formatKatha(view.landKatha) : null],
    ["Bedrooms", view.bedrooms !== null ? String(view.bedrooms) : null],
    ["Bathrooms", view.bathrooms !== null ? String(view.bathrooms) : null],
    ["Floor", view.floorNumber !== null ? (view.totalFloors !== null ? `${floor(view.floorNumber)} of ${view.totalFloors}` : floor(view.floorNumber)) : null],
    ["Total floors", view.totalFloors !== null ? String(view.totalFloors) : null],
    ["Parking spaces", view.parkingSpaces !== null ? String(view.parkingSpaces) : null],
    ["Reference", view.refCode],
  ];
  return (
    <dl className="grid gap-x-8 sm:grid-cols-2">
      {rows
        .filter((row): row is [string, string] => row[1] !== null)
        .map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 border-b border-line py-3 text-sm">
            <dt className="text-fg-muted">{label}</dt>
            <dd className="text-right text-fg">{value}</dd>
          </div>
        ))}
    </dl>
  );
}
