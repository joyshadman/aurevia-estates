import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "react-email";
import { brand } from "../brand";

// Booking and lead notifications (spec 0019, *Three emails*). English only;
// times arrive already written in Sylhet time.

export type NotifyEmailProps = {
  heading: string;
  intro: string;
  // Label and value rows: the home, the time, the visitor's contact.
  facts: { label: string; value: string }[];
  button: { label: string; href: string };
  footer: string;
};

export function NotifyEmail({ heading, intro, facts, button, footer }: NotifyEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{heading}</Preview>
      <Body style={{ backgroundColor: brand.surface, fontFamily: "Inter, Arial, sans-serif", margin: 0, padding: "32px 0" }}>
        <Container
          style={{
            backgroundColor: brand.raised,
            border: `1px solid ${brand.line}`,
            borderRadius: 16,
            maxWidth: 480,
            padding: "40px 32px",
          }}
        >
          <Text style={{ color: brand.accent, fontSize: 12, letterSpacing: "0.18em", margin: 0, textTransform: "uppercase" }}>
            Aurevia Estates · Sylhet
          </Text>
          <Heading style={{ color: brand.fg, fontFamily: "'Playfair Display', Georgia, serif", fontSize: 28, fontWeight: 500, margin: "16px 0 8px" }}>
            {heading}
          </Heading>
          <Text style={{ color: brand.muted, fontSize: 15, lineHeight: "24px", margin: "0 0 24px" }}>{intro}</Text>
          <Section style={{ backgroundColor: brand.surface, borderRadius: 12, padding: "8px 20px" }}>
            {facts.map((fact) => (
              <Text key={fact.label} style={{ color: brand.fg, fontSize: 14, lineHeight: "22px", margin: "8px 0" }}>
                <span style={{ color: brand.muted }}>{fact.label}</span>
                <br />
                {fact.value}
              </Text>
            ))}
          </Section>
          <Section style={{ margin: "28px 0 0", textAlign: "center" }}>
            <Button
              href={button.href}
              style={{
                backgroundColor: brand.accent,
                borderRadius: 999,
                color: brand.onAccent,
                fontSize: 15,
                fontWeight: 500,
                padding: "14px 28px",
              }}
            >
              {button.label}
            </Button>
          </Section>
          <Hr style={{ borderColor: brand.line, margin: "32px 0 16px" }} />
          <Text style={{ color: brand.muted, fontSize: 12, lineHeight: "18px", margin: 0 }}>{footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}
