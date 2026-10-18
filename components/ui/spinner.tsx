import { cn } from "@/lib/cn";

const sizes = { sm: "h-4 w-4 border-2", md: "h-6 w-6 border-2" } as const;

export function Spinner({
  size = "md",
  label = "Loading",
  className,
}: {
  size?: keyof typeof sizes;
  label?: string;
  className?: string;
}) {
  return (
    <span role="status" className={cn("inline-flex items-center", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "inline-block animate-spin rounded-full border-current border-r-transparent opacity-80",
          sizes[size],
        )}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
