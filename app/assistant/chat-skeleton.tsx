import { Skeleton } from "@/components/ui/skeleton";

// The three panes' shape while the chat loads (spec 0006, AC-17).
export function ChatSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-12" aria-hidden="true">
      <div className="hidden flex-col gap-3 lg:col-span-3 lg:flex">
        <Skeleton className="h-11 w-full rounded-full" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
      <Skeleton className="h-[calc(100dvh-8rem)] w-full rounded-2xl lg:col-span-6" />
      <Skeleton className="hidden h-80 w-full rounded-2xl lg:col-span-3 lg:block" />
    </div>
  );
}
