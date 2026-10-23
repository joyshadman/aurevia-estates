import { CalendarCheck, MessagesSquare, ShieldCheck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Container, Eyebrow } from "@/components/ui/layout";

const reasons: { icon: LucideIcon; title: string; body: ReactNode }[] = [
  {
    icon: MessagesSquare,
    title: "Your search, remembered",
    body: (
      <>
        Every chat with the assistant is saved, in English or <span lang="bn">বাংলা</span>, so you can pick up where
        you left off.
      </>
    ),
  },
  {
    icon: ShieldCheck,
    title: "Only real, checked homes",
    body: "The assistant recommends listings our team has verified, never invented ones.",
  },
  {
    icon: CalendarCheck,
    title: "Viewings in one step",
    body: "Book a visit from the chat and an Aurevia advisor confirms it with you.",
  },
];

// The shared frame for sign in pages: the form card beside a static panel that
// says why an account is worth it (spec 0003 tokens and kit).
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <Container className="grid flex-1 items-start gap-10 py-10 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-16">
      <section className="w-full max-w-md rounded-3xl border border-line bg-surface-raised p-6 shadow-soft sm:p-10 lg:justify-self-end">
        {children}
      </section>
      <aside className="w-full max-w-xl rounded-3xl bg-accent-subtle p-8 sm:p-10">
        <Eyebrow className="text-accent-subtle-fg">Aurevia Assistant</Eyebrow>
        <p className="mt-4 font-display text-2xl leading-snug text-fg sm:text-3xl">
          Tell us how your family lives. We&apos;ll find the home that fits.
        </p>
        <ul className="mt-8 flex flex-col gap-6">
          {reasons.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-raised text-accent">
                <Icon aria-hidden="true" strokeWidth={1.5} className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-medium text-fg">{title}</span>
                <span className="mt-1 block text-sm text-fg-muted">{body}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-8 border-t border-line pt-6 text-xs text-fg-muted">
          We use your email only to sign you in and to confirm viewings you book.
        </p>
      </aside>
    </Container>
  );
}
