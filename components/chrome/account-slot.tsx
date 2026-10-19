import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { SavedSession } from "@/components/listing/saved-session";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/skeleton";
import { liveNav, routes } from "@/lib/nav";
import { signOutAction } from "@/app/(auth)/actions";
import { getSessionUser } from "@/lib/server/auth";

// The one session read in the header (spec 0003). Signed in users get the
// account menu; "Saved homes" joins it with feature 14 (spec 0013).
export async function AccountSlot() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <>
        <SavedSession userId={null} />
        <Button href={routes.signIn} intent="secondary" size="sm" className="max-sm:hidden">
          Sign in
        </Button>
      </>
    );
  }

  return (
    <>
      <SavedSession userId={user.id} />
      <Menu label="Your account" triggerClassName="rounded-full" trigger={<Avatar src={user.avatarUrl} name={user.fullName} email={user.email} size="md" />}>
        <MenuLabel>{user.fullName?.trim() || user.email}</MenuLabel>
        <MenuItem href={routes.account}>Your account</MenuItem>
        {liveNav("account").map((entry) => (
          <MenuItem key={entry.href} href={entry.href}>
            {entry.label}
          </MenuItem>
        ))}
        {user.role === "AGENT" ? <MenuItem href={routes.dashboard}>Dashboard</MenuItem> : null}
        <MenuSeparator />
        <MenuItem onSelect={signOutAction}>Sign out</MenuItem>
      </Menu>
    </>
  );
}

export function AccountSlotSkeleton() {
  return <Skeleton className="h-10 w-10 rounded-full sm:w-20" />;
}
