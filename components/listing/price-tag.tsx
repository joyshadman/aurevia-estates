import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";

const sizes = { sm: "text-[1.7rem]", lg: "text-4xl" } as const;

export function PriceTag({
  priceBdt,
  negotiable = false,
  size = "sm",
  className,
}: {
  priceBdt: number;
  negotiable?: boolean;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <p className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className={cn("font-display leading-none text-fg", sizes[size])}>{formatPrice(priceBdt)}</span>
      {negotiable ? <Badge tone="accent">Negotiable</Badge> : null}
    </p>
  );
}
