"use client";

import { LayoutDashboard, LogOut } from "lucide-react";
import { useTransition } from "react";
import { signOut } from "@/app/(auth)/actions";
import { Avatar } from "@/components/ui/avatar";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { liveNav, routes } from "@/lib/nav";

type AccountMenuProps = {
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  isAgent: boolean;
};

// The signed in account slot (spec 0003): who you are, the dashboard for agents,
// live account links, and Sign out (spec 0004, this device only).
export function AccountMenu({ fullName, email, avatarUrl, isAgent }: AccountMenuProps) {
  const [pending, startTransition] = useTransition();

  return (
    <Menu
      label="Your account"
      triggerClassName="rounded-full"
      trigger={<Avatar src={avatarUrl} name={fullName} email={email} size="md" />}
    >
      <MenuLabel>
        {fullName ? <span className="block text-sm font-medium text-fg">{fullName}</span> : null}
        {email ? <span className="block truncate">{email}</span> : null}
      </MenuLabel>
      <MenuSeparator />
      {isAgent ? (
        <MenuItem href={routes.dashboard}>
          <LayoutDashboard aria-hidden="true" strokeWidth={1.5} className="h-4 w-4 text-fg-subtle" />
          Dashboard
        </MenuItem>
      ) : null}
      {liveNav("account").map((entry) => (
        <MenuItem key={entry.href} href={entry.href}>
          {entry.label}
        </MenuItem>
      ))}
      <MenuItem onSelect={() => startTransition(() => signOut())}>
        <LogOut aria-hidden="true" strokeWidth={1.5} className="h-4 w-4 text-fg-subtle" />
        {pending ? "Signing out…" : "Sign out"}
      </MenuItem>
    </Menu>
  );
}
