import type { LucideIcon } from "lucide-react";
import { CircleAlert, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type StateProps = {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
};

function StateFrame({ title, body, action, icon: Icon, className, tone }: StateProps & { tone: "neutral" | "danger" }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface-raised px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <Icon
          aria-hidden="true"
          strokeWidth={1.5}
          className={cn("h-8 w-8", tone === "danger" ? "text-danger" : "text-fg-subtle")}
        />
      ) : null}
      <h2 className="font-display text-xl text-fg">{title}</h2>
      {body ? <div className="max-w-md text-sm text-fg-muted">{body}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function EmptyState({ icon = Inbox, ...props }: StateProps) {
  return <StateFrame icon={icon} tone="neutral" {...props} />;
}

export function ErrorState({ icon = CircleAlert, ...props }: StateProps) {
  return <StateFrame icon={icon} tone="danger" {...props} />;
}
