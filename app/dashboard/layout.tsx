import { Suspense } from "react";
import { Container } from "@/components/ui/layout";
import { DashboardNav, DashboardNavLinks } from "./dashboard-nav";

// The agent dashboard shell (spec 0005, *Pages*; the admin mockup): a sidebar
// beside the page, a nav row on small screens. Static: it reads no session.
// Every page under it still calls `requireAgent()` itself (spec 0004, AC-8).
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <Container className="grid flex-1 gap-6 py-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10 lg:py-10">
      <aside className="lg:border-r lg:border-line lg:pr-6">
        <p className="hidden font-display text-lg text-fg lg:block">
          Aurevia <span className="text-fg-muted">Agent portal</span>
        </p>
        <Suspense fallback={<DashboardNavLinks pathname={null} />}>
          <DashboardNav />
        </Suspense>
      </aside>
      <div className="min-w-0">{children}</div>
    </Container>
  );
}
