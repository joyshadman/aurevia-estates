import { AccountMenu } from "@/components/chrome/account-menu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/lib/nav";
import { getSessionUser } from "@/lib/server/auth";

// The one session read in the header (spec 0003). Theme sync joins the signed in
// branch with the account theme milestone (spec 0003, AC-5).
export async function AccountSlot() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <Button href={routes.signIn} intent="secondary" size="sm">
        Sign in
      </Button>
    );
  }

  return (
    <AccountMenu
      fullName={user.fullName || null}
      email={user.email}
      avatarUrl={user.avatarUrl}
      isAgent={user.role === "AGENT"}
    />
  );
}

export function AccountSlotSkeleton() {
  return <Skeleton className="h-10 w-10 rounded-full sm:w-20" />;
}
