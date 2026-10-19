import { Skeleton } from "@/components/ui/skeleton";

export function ChatSkeleton() {
  return (
    <div className="flex flex-1 gap-6 py-6" aria-hidden="true">
      <Skeleton className="hidden h-[70vh] w-64 rounded-2xl lg:block" />
      <Skeleton className="h-[70vh] flex-1 rounded-2xl" />
      <Skeleton className="hidden h-[70vh] w-72 rounded-2xl lg:block" />
    </div>
  );
}
