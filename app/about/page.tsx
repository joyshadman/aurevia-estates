import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";
import { ListingImage } from "@/components/listing/listing-image";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Container, Eyebrow } from "@/components/ui/layout";
import { agency } from "@/lib/agency";
import { countryOptions } from "@/lib/domain/phone-countries";
import { isOptimizableImage } from "@/lib/images";
import { routes } from "@/lib/nav";
import { publicAgents, type PublicAgent } from "@/lib/server/contact";
import { homepageData } from "@/lib/server/homepage";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "About & contact",
  description: "Aurevia Estates is a Sylhet agency that checks every home by hand. Meet the advisors, or send us a note.",
};

// Drafted from the mockup without its names, dates, or numbers (spec 0015,
// *No invented facts*). For the agency to review.
const values = [
  { title: "Candour", body: "We tell you about the damp wall and the noisy road before you find them yourself." },
  { title: "Care", body: "Every listing is prepared and checked by an Aurevia agent before it goes live." },
  { title: "Craft", body: "We favour well built homes that suit Sylhet's climate and the way families live here." },
  { title: "Continuity", body: "We plan for the long term, whether you are buying from Sylhet or from abroad." },
];

const formatPhone = (e164: string) => e164.replace(/^\+880(\d{4})(\d{6})$/, "+880 $1 $2");

// `/about` (spec 0015): public and cached, no cookies. Contact lines show only
// once `lib/agency.ts` has them (AC-5).
export default async function AboutPage() {
  const [agents, home] = await Promise.all([publicAgents(), homepageData()]);
  const [first, second] = home.newest;

  return (
    <>
      <Container className="grid gap-12 pt-16 pb-16 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-7">
          <Eyebrow className="text-accent">About Aurevia</Eyebrow>
          <h1 className="mt-5 font-display text-5xl leading-[1.05] text-balance text-fg sm:text-7xl">
            A Sylheti agency, built on a <em className="text-accent italic">handshake.</em>
          </h1>
        </div>
        <p className="max-w-md leading-relaxed text-fg-muted lg:col-span-5 lg:pb-3">
          We help families in Sylhet and abroad find a home they can trust, with fewer listings, each one checked by hand.
        </p>
      </Container>

      {first?.cover ? (
        <Container>
          <div className="grid gap-4 sm:grid-cols-3">
            <ListingImage src={first.cover.url} alt={first.cover.alt || first.title} priority className="aspect-[4/5] rounded-2xl sm:col-span-2 sm:aspect-[16/10]" />
            {second?.cover ? (
              <ListingImage src={second.cover.url} alt={second.cover.alt || second.title} className="hidden rounded-2xl sm:block" />
            ) : null}
          </div>
        </Container>
      ) : null}

      <Container className="grid gap-12 py-20 sm:py-24 lg:grid-cols-12">
        <h2 className="font-display text-4xl leading-tight text-fg lg:col-span-5">Our story</h2>
        <div className="max-w-[65ch] space-y-5 leading-relaxed text-fg-muted lg:col-span-7">
          <p>
            Too many families buy a home in Sylhet sight unseen, from a photo and a phone call, and regret it. Aurevia exists to do
            the opposite: show fewer homes, check every one of them by hand, and be honest about their faults as well as their
            charms.
          </p>
          <p>
            Our advisors know the streets, the neighbours, and the way water moves in July. Our assistant lets you describe the home
            you want in English or <span lang="bn">বাংলা</span>, at any hour, and only ever shows you homes we have published.
          </p>
        </div>
      </Container>

      <section aria-labelledby="values-heading" className="bg-feature text-on-media">
        <Container className="py-20 sm:py-24">
          <Eyebrow className="text-on-media-muted">What we stand for</Eyebrow>
          <h2 id="values-heading" className="mt-3 max-w-2xl font-display text-4xl leading-tight text-balance sm:text-5xl">
            Honest advice, the way a neighbour would give it.
          </h2>
          <ul className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((value) => (
              <li key={value.title} className="border-t border-media-line pt-5">
                <h3 className="font-display text-2xl">{value.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-on-media-muted">{value.body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {agents.length > 0 ? <Team agents={agents} /> : null}

      <section id="contact" aria-labelledby="contact-heading" className="scroll-mt-24">
        <Container className="grid gap-12 py-20 sm:py-24 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Eyebrow className="text-accent">Contact</Eyebrow>
            <h2 id="contact-heading" className="mt-3 font-display text-4xl leading-tight text-balance text-fg sm:text-5xl">
              Send us a note.
            </h2>
            <p className="mt-5 max-w-md leading-relaxed text-fg-muted">
              Buying, selling, or just asking: tell us a little and an advisor will get back to you. For a specific home, the
              assistant can book a viewing straight away.
            </p>
            <ContactLines />
            <Button href={routes.assistant} intent="secondary" className="mt-8">
              Ask the assistant instead
            </Button>
          </div>
          <div className="lg:col-span-7">
            <ContactForm countries={countryOptions()} />
          </div>
        </Container>
      </section>
    </>
  );
}

function Team({ agents }: { agents: PublicAgent[] }) {
  return (
    <section id="team" aria-labelledby="team-heading">
      <Container className="py-20 sm:py-24">
        <Eyebrow className="text-accent">Advisors</Eyebrow>
        <h2 id="team-heading" className="mt-3 font-display text-4xl text-fg sm:text-5xl">
          The people who walk every room
        </h2>
        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {agents.map((agent) => (
            <li key={agent.id}>
              <div className="relative grid aspect-[4/5] place-items-center overflow-hidden rounded-2xl bg-surface-sunken">
                {agent.photoUrl ? (
                  <Image
                    src={agent.photoUrl}
                    alt={agent.name}
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                    unoptimized={!isOptimizableImage(agent.photoUrl)}
                    className="object-cover"
                  />
                ) : (
                  <Avatar name={agent.name} size="md" className="h-20 w-20 text-2xl" />
                )}
              </div>
              <p className="mt-4 font-display text-xl text-fg">{agent.name}</p>
              {agent.title ? <p className="text-sm text-fg-muted">{agent.title}</p> : null}
              {agent.bio ? <p className="mt-2 text-sm leading-relaxed text-fg-muted">{agent.bio}</p> : null}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

// AC-5: each line shows only once the agency has filled it in.
function ContactLines() {
  const lines: { key: string; icon: typeof Phone; title: string; body: ReactNode }[] = [];
  if (agency.officeAddress) {
    const map = agency.officeLocation
      ? `https://www.google.com/maps/search/?api=1&query=${agency.officeLocation.latitude},${agency.officeLocation.longitude}`
      : null;
    lines.push({
      key: "office",
      icon: MapPin,
      title: "Office",
      body: (
        <>
          {agency.officeAddress}
          {map ? (
            <>
              {" · "}
              <a href={map} target="_blank" rel="noopener" className="underline hover:text-accent">
                Open in Google Maps<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </>
          ) : null}
        </>
      ),
    });
  }
  if (agency.hours?.length) {
    lines.push({ key: "hours", icon: Clock, title: "Hours", body: agency.hours.map((line) => <span key={line} className="block">{line}</span>) });
  }
  if (agency.phone) {
    lines.push({ key: "phone", icon: Phone, title: "Phone", body: <a href={`tel:${agency.phone}`} className="hover:text-accent">{formatPhone(agency.phone)}</a> });
  }
  if (agency.whatsapp) {
    lines.push({
      key: "whatsapp",
      icon: MessageCircle,
      title: "WhatsApp",
      body: (
        <a href={`https://wa.me/${agency.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener" className="hover:text-accent">
          {formatPhone(agency.whatsapp)}
        </a>
      ),
    });
  }
  if (agency.email) {
    lines.push({ key: "email", icon: Mail, title: "Email", body: <a href={`mailto:${agency.email}`} className="hover:text-accent">{agency.email}</a> });
  }
  if (lines.length === 0) return null;
  return (
    <ul className="mt-10 space-y-6 text-sm">
      {lines.map(({ key, icon: Icon, title, body }) => (
        <li key={key} className="flex gap-4">
          <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-surface-raised text-accent">
            <Icon strokeWidth={1.5} className="h-4 w-4" />
          </span>
          <div>
            <p className="font-medium text-fg">{title}</p>
            <p className="text-fg-muted">{body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
