import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/lib/nav";
import { getSessionUser } from "@/lib/server/auth";

// The one session read in the header (spec 0003). Signed in users get the full
// account menu and theme sync when the sign in feature lands (spec 0004).
export async function AccountSlot() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <Button href={routes.signIn} intent="secondary" size="sm" className="max-sm:hidden">
        Sign in
      </Button>
    );
  }

  return (
    <a href={routes.account} aria-label="Your account" className="rounded-full">
      <Avatar src={user.avatarUrl} name={user.fullName} email={user.email} size="md" />
    </a>
  );
}

export function AccountSlotSkeleton() {
  return <Skeleton className="h-10 w-10 rounded-full sm:w-20" />;
}
