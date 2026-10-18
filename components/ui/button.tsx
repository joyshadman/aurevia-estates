import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/spinner";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-colors duration-fast disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
  {
    variants: {
      intent: {
        primary: "bg-accent text-on-accent hover:bg-accent-hover",
        secondary: "border border-line-strong bg-surface-raised text-fg hover:bg-surface-sunken",
        ghost: "text-fg hover:bg-surface-sunken",
        danger: "bg-danger text-on-accent hover:bg-danger-hover",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-base",
      },
      icon: {
        true: "px-0",
        false: "",
      },
    },
    compoundVariants: [
      { icon: true, size: "sm", className: "w-9" },
      { icon: true, size: "md", className: "w-11" },
      { icon: true, size: "lg", className: "w-12" },
    ],
    defaultVariants: { intent: "primary", size: "md", icon: false },
  },
);

type Variants = VariantProps<typeof buttonVariants>;

type ButtonAsButton = Variants & {
  href?: undefined;
  loading?: boolean;
} & ComponentProps<"button">;

type ButtonAsLink = Variants & {
  href: string;
  loading?: undefined;
} & Omit<ComponentProps<"a">, "href">;

export type ButtonProps = ButtonAsButton | ButtonAsLink;

// `href` starting with "/" renders `next/link`; other hrefs render a plain link.
export function Button(props: ButtonProps) {
  if (props.href !== undefined) {
    const { intent, size, icon, className, href, children, ...rest } = props;
    const classes = cn(buttonVariants({ intent, size, icon }), className);
    if (href.startsWith("/")) {
      return (
        <Link href={href} className={classes} {...rest}>
          {children}
        </Link>
      );
    }
    return (
      <a href={href} rel="noopener" className={classes} {...rest}>
        {children}
      </a>
    );
  }

  const { intent, size, icon, className, loading, disabled, children, type, ...rest } = props;
  return (
    <button
      type={type ?? "button"}
      className={cn(buttonVariants({ intent, size, icon }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size="sm" label="Working" /> : null}
      {children}
    </button>
  );
}
