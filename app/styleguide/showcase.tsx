"use client";

import { Mail } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import { PropertyCard } from "@/components/listing/property-card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { LanguageToggle, type ChatLocale } from "@/components/ui/language-toggle";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { Radio } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { toast } from "@/components/ui/toast";
import { ThemeToggle } from "@/components/chrome/theme-toggle";
import type { ListingCardDTO } from "@/lib/domain/listing-card";

const roles = [
  "surface",
  "surface-raised",
  "surface-sunken",
  "fg",
  "fg-muted",
  "fg-subtle",
  "line",
  "line-strong",
  "accent",
  "accent-subtle",
  "secondary",
  "success",
  "warning",
  "danger",
];

const ramp = [
  "canvas",
  "burgundy-700",
  "burgundy-600",
  "burgundy-300",
  "burgundy-200",
  "burgundy-100",
  "plum-700",
  "plum-600",
  "plum-300",
  "plum-100",
  "charcoal-900",
  "ink-950",
];

const sampleApartment: ListingCardDTO = {
  id: "00000000-0000-7000-8000-000000001001",
  slug: "surma-sky-residence-aur-1001",
  refCode: "AUR-1001",
  title: "Surma Sky Residence",
  areaName: "Zindabazar",
  propertyType: "APARTMENT",
  priceBdt: 32000000,
  priceNegotiable: true,
  bedrooms: 3,
  bathrooms: 3,
  builtUpSqft: 2150,
  landKatha: null,
  cover: {
    url: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1000&q=80",
    alt: "Open plan living room with tall windows",
  },
};

const samplePlot: ListingCardDTO = {
  id: "00000000-0000-7000-8000-000000001002",
  slug: "tilagor-corner-plot-aur-1002",
  refCode: "AUR-1002",
  title: "Tilagor Corner Plot",
  areaName: "Tilagor",
  propertyType: "PLOT",
  priceBdt: 12500000,
  priceNegotiable: false,
  bedrooms: null,
  bathrooms: null,
  builtUpSqft: null,
  landKatha: 5.5,
  cover: null,
};

const sampleBroken: ListingCardDTO = {
  ...sampleApartment,
  id: "00000000-0000-7000-8000-000000001003",
  slug: "shibgonj-garden-house-aur-1003",
  refCode: "AUR-1003",
  title: "Shibgonj Garden House",
  areaName: "Shibgonj",
  propertyType: "HOUSE",
  bedrooms: 4,
  bathrooms: null,
  landKatha: 4,
  priceNegotiable: false,
  cover: { url: "https://images.unsplash.com/photo-0000000000000-broken?w=1000", alt: "Garden house front" },
};

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-10">
      <h2 className="mb-6 font-display text-2xl text-fg">{title}</h2>
      {children}
    </section>
  );
}

export function Showcase() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const closeDialog = useCallback(() => setDialogOpen(false), []);
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const [locale, setLocale] = useState<ChatLocale>("en");
  const [saved, setSaved] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-4 pb-8">
        <div>
          <h1 className="font-display text-4xl text-fg">Styleguide</h1>
          <p className="mt-2 text-sm text-fg-muted">Every base component and state. Switch themes to check both.</p>
        </div>
        <ThemeToggle />
      </header>

      <Block title="Role colors">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {roles.map((role) => (
            <li key={role} className="rounded-xl border border-line bg-surface-raised p-2 text-xs text-fg-muted">
              <span
                aria-hidden="true"
                className="mb-2 block h-12 rounded-lg border border-line"
                style={{ background: `var(--color-${role})` }}
              />
              {role}
            </li>
          ))}
        </ul>
        <h3 className="mt-8 mb-3 text-sm font-medium text-fg">Brand ramp (used only inside globals.css)</h3>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-12">
          {ramp.map((name) => (
            <li key={name} className="text-[11px] text-fg-muted">
              <span
                aria-hidden="true"
                className="mb-1 block h-10 rounded-lg border border-line"
                style={{ background: `var(--brand-${name})` }}
              />
              {name}
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Type">
        <div className="space-y-3 text-fg">
          <p className="font-display text-6xl">Display 6xl</p>
          <p className="font-display text-4xl">Display 4xl</p>
          <p className="text-2xl">Sans 2xl</p>
          <p className="text-base">Sans base: the quick brown fox jumps over the lazy dog.</p>
          <p className="text-sm text-fg-muted">Muted sm text for secondary information.</p>
          <p className="text-xs text-fg-subtle">Subtle xs caption text.</p>
          <p lang="bn" className="text-base">
            বাংলা লেখা: আপনার পরিবারের জন্য সঠিক বাড়ি খুঁজে দিই।
          </p>
        </div>
      </Block>

      <Block title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button intent="secondary">Secondary</Button>
          <Button intent="ghost">Ghost</Button>
          <Button intent="danger">Danger</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button icon intent="secondary" aria-label="Email us">
            <Mail aria-hidden="true" strokeWidth={1.5} className="h-5 w-5" />
          </Button>
          <Button href="/assistant" intent="secondary">
            Internal link
          </Button>
        </div>
      </Block>

      <Block title="Form controls">
        <form
          className="grid max-w-xl gap-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
          }}
        >
          <Field id="sg-name" label="Full name" hint="As it appears on your ID.">
            <Input placeholder="Nadia Rahman" autoComplete="name" />
          </Field>
          <Field id="sg-phone" label="Phone" error="Enter a valid phone number." showError={submitted}>
            <Input type="tel" defaultValue="12" />
          </Field>
          <Field id="sg-area" label="Area">
            <Select defaultValue="zindabazar">
              <option value="zindabazar">Zindabazar</option>
              <option value="uposhohor">Uposhohor</option>
              <option value="shibgonj">Shibgonj</option>
            </Select>
          </Field>
          <Field id="sg-note" label="Note for the advisor">
            <Textarea placeholder="Coming with my parents, need ground floor access" />
          </Field>
          <Field id="sg-disabled" label="Disabled input">
            <Input disabled value="Can't edit this" readOnly />
          </Field>
          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm font-medium text-fg">Must haves</legend>
            <Checkbox id="sg-parking" label="Parking" defaultChecked />
            <Checkbox id="sg-lift" label="Lift" indeterminate />
            <Checkbox id="sg-pool" label="Pool (disabled)" disabled />
          </fieldset>
          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm font-medium text-fg">Completion</legend>
            <Radio id="sg-ready" name="sg-completion" label="Ready to move in" defaultChecked />
            <Radio id="sg-construction" name="sg-completion" label="Under construction" />
          </fieldset>
          <div>
            <Button type="submit">Submit (shows the error)</Button>
          </div>
        </form>
      </Block>

      <Block title="Overlays and feedback">
        <div className="flex flex-wrap items-center gap-3">
          <Button intent="secondary" onClick={() => setDialogOpen(true)}>
            Open dialog
          </Button>
          <Button intent="secondary" onClick={() => setSheetOpen(true)}>
            Open bottom sheet
          </Button>
          <Menu
            label="Sample menu"
            trigger="Sample menu"
            triggerClassName="inline-flex h-11 items-center rounded-full border border-line-strong bg-surface-raised px-5 text-sm font-medium text-fg"
          >
            <MenuLabel>nadia@example.com</MenuLabel>
            <MenuItem onSelect={() => toast({ title: "Profile opened" })}>Profile</MenuItem>
            <MenuItem onSelect={() => toast({ tone: "success", title: "Saved" })}>Save</MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => toast({ tone: "danger", title: "Signed out" })}>Sign out</MenuItem>
          </Menu>
          <Button intent="ghost" onClick={() => toast({ title: "Heads up", body: "This is an info toast." })}>
            Info toast
          </Button>
          <Button intent="ghost" onClick={() => toast({ tone: "success", title: "Viewing requested" })}>
            Success toast
          </Button>
          <Button intent="ghost" onClick={() => toast({ tone: "danger", title: "Something went wrong" })}>
            Danger toast
          </Button>
          <LanguageToggle value={locale} onChange={setLocale} />
        </div>
        <Dialog
          open={dialogOpen}
          onClose={closeDialog}
          title="Confirm viewing"
          description="Your advisor will confirm by phone or WhatsApp."
          footer={
            <>
              <Button intent="ghost" onClick={closeDialog}>
                Cancel
              </Button>
              <Button onClick={() => toast({ tone: "success", title: "Toast above the dialog" })}>Show toast</Button>
            </>
          }
        >
          <p className="text-sm text-fg-muted">Tab stays inside this dialog. Escape or the backdrop closes it.</p>
        </Dialog>
        <Dialog open={sheetOpen} onClose={closeSheet} title="Your brief" placement="bottom">
          <p className="text-sm text-fg-muted">The chat brief opens like this below the large breakpoint.</p>
        </Dialog>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Badge>Neutral</Badge>
          <Badge tone="accent">Accent</Badge>
          <Badge tone="success">Confirmed</Badge>
          <Badge tone="warning">Awaiting update</Badge>
          <Badge tone="danger">Cancelled</Badge>
          <Spinner />
          <Avatar name="Nadia Rahman" />
          <Avatar email="imran@example.com" size="sm" />
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <EmptyState
            title="No listings yet"
            body="Create your first listing to see it here."
            action={<Button size="sm">New listing</Button>}
          />
          <ErrorState
            title="We couldn't load this"
            body="Check your connection and try again."
            action={
              <Button size="sm" intent="secondary">
                Retry
              </Button>
            }
          />
        </div>
      </Block>

      <Block title="Property cards">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          <PropertyCard
            listing={sampleApartment}
            href="/styleguide"
            favorite={{ pressed: saved, onToggle: () => setSaved((v) => !v) }}
          />
          <PropertyCard listing={samplePlot} badge={<Badge tone="accent">96% match</Badge>} />
          <PropertyCard
            listing={sampleBroken}
            badge={<Badge tone="warning">Close, but</Badge>}
            footer={<p className="text-sm text-fg-muted">3 bedrooms, you asked for 4</p>}
          />
        </div>
        <div className="mt-8">
          <PropertyCard listing={sampleApartment} layout="list" href="/styleguide" />
        </div>
      </Block>
    </div>
  );
}
