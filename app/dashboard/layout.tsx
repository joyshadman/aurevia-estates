import type { Metadata } from "next";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { Container } from "@/components/ui/layout";

// Static shell only. Every page under `app/dashboard/**` calls `requireAgent()`
// itself, since layouts don't rerun on client navigation (spec 0004, AC-8).
export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s · Dashboard · Aurevia Estates" },
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <Container className="flex flex-1 flex-col gap-6 py-8 lg:flex-row lg:gap-10">
      <aside className="lg:w-52 lg:shrink-0">
        <DashboardNav />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </Container>
  );
}
