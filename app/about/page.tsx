import { Clock, Mail, MapPin, MessageCircle, Phone, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ContactForm } from "@/components/about/contact-form";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Container, Eyebrow, Section } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { aboutCopy, office } from "@/lib/content/about";
import { publicEnv } from "@/lib/env";
import { publicAdvisors } from "@/lib/server/about";
import { phoneCountries } from "@/lib/server/viewing-bookings";

// About and contact (spec 0014, assumed). Public and cached: it never reads the
// session. Real data only; office lines render once the agency sets them.

export const metadata: Metadata = {
  title: "About and contact",
  description: aboutCopy.lead,
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  const siteKey = publicEnv().NEXT_PUBLIC_HCAPTCHA_SITE_KEY;
  const countries = [...phoneCountries()].sort((a, b) => (a.code === "BD" ? -1 : b.code === "BD" ? 1 : 0));

  return (
    <>
      <Container className="flex flex-col items-start gap-5 py-14 lg:py-20">
        <Eyebrow>{aboutCopy.eyebrow}</Eyebrow>
        <h1 className="max-w-3xl font-display text-5xl leading-[1.05] text-fg sm:text-6xl">{aboutCopy.headline}</h1>
        <p className="max-w-2xl text-lg text-fg-muted">{aboutCopy.lead}</p>
      </Container>

      <Section tone="raised" aria-labelledby="about-story">
        <Container className="grid gap-10 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <h2 id="about-story" className="font-display text-3xl text-fg">
            {aboutCopy.storyTitle}
          </h2>
          <div className="flex max-w-2xl flex-col gap-4 text-fg-muted">
            {aboutCopy.story.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </Container>
      </Section>

      <Section aria-labelledby="about-values">
        <Container className="flex flex-col gap-8">
          <h2 id="about-values" className="font-display text-3xl text-fg">
            {aboutCopy.missionTitle}
          </h2>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {aboutCopy.values.map((value) => (
              <li key={value.title} className="rounded-2xl border border-line bg-surface-raised p-6">
                <h3 className="font-display text-xl text-fg">{value.title}</h3>
                <p className="mt-2 text-sm text-fg-muted">{value.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Suspense fallback={null}>
        <Advisors />
      </Suspense>

      <Section id="contact" tone="raised" aria-labelledby="about-contact" className="scroll-mt-20">
        <Container className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_32rem]">
          <div className="flex flex-col gap-6">
            <div>
              <Eyebrow>Contact</Eyebrow>
              <h2 id="about-contact" className="mt-2 font-display text-3xl text-fg">
                {aboutCopy.contactTitle}
              </h2>
              <p className="mt-3 max-w-xl text-fg-muted">{aboutCopy.contactLead}</p>
            </div>
            <OfficeDetails />
          </div>
          {siteKey ? (
            <Suspense fallback={<Skeleton className="h-[640px] rounded-2xl" />}>
              <ContactForm siteKey={siteKey} countries={countries} />
            </Suspense>
          ) : (
            // spec 0014: the form stays off until the hCaptcha keys are set.
            <div className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface-raised p-6">
              <h3 className="font-display text-2xl text-fg">Our enquiry form opens soon</h3>
              <p className="text-sm text-fg-muted">Meanwhile, the Aurevia Assistant can answer questions about our homes and book a viewing with an advisor.</p>
              <Button href="/assistant">
                <Sparkles aria-hidden="true" className="h-4 w-4" />
                Ask the Aurevia Assistant
              </Button>
            </div>
          )}
        </Container>
      </Section>
    </>
  );
}

function OfficeDetails() {
  const lines = [
    office.address && { icon: MapPin, label: "Office", body: office.address, href: office.mapsUrl },
    office.hours && { icon: Clock, label: "Hours", body: office.hours.join("\n"), href: null },
    office.phone && { icon: Phone, label: "Phone", body: office.phone, href: `tel:${office.phone.replace(/[^\d+]/g, "")}` },
    office.email && { icon: Mail, label: "Email", body: office.email, href: `mailto:${office.email}` },
    office.whatsapp && { icon: MessageCircle, label: "WhatsApp", body: "Chat on WhatsApp", href: `https://wa.me/${office.whatsapp}` },
  ].filter((line) => !!line);
  if (lines.length === 0) return null;
  return (
    <dl className="grid gap-5 sm:grid-cols-2">
      {lines.map(({ icon: Icon, label, body, href }) => (
        <div key={label} className="flex gap-3">
          <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div>
            <dt className="text-sm font-medium text-fg">{label}</dt>
            <dd className="mt-1 whitespace-pre-line text-sm text-fg-muted">
              {href ? (
                <a href={href} className="text-accent hover:underline" {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>
                  {body}
                </a>
              ) : (
                body
              )}
            </dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

async function Advisors() {
  await connection();
  const advisors = await publicAdvisors();
  if (advisors.length === 0) return null;
  return (
    <Section aria-labelledby="about-advisors">
      <Container className="flex flex-col gap-8">
        <div>
          <h2 id="about-advisors" className="font-display text-3xl text-fg">
            {aboutCopy.advisorsTitle}
          </h2>
          <p className="mt-2 text-fg-muted">{aboutCopy.advisorsLead}</p>
        </div>
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {advisors.map((advisor) => (
            <li key={advisor.id} className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface-raised p-6 text-center">
              <Avatar src={advisor.photoUrl} name={advisor.name} size="lg" />
              <div>
                <p className="font-medium text-fg">{advisor.name}</p>
                {advisor.title ? <p className="text-sm text-fg-muted">{advisor.title}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
