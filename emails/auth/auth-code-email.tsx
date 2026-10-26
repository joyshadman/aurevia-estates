import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";
import { brand } from "../brand";

// Auth emails (spec 0008, AC-13), sent from Better Auth's email callback.

export type AuthEmailKind = "signin" | "signup" | "recovery" | "set-password" | "reauthentication";

const copy: Record<AuthEmailKind, { subject: string; heading: string; intro: string; button: string }> = {
  signin: {
    subject: "Your Aurevia sign in code",
    heading: "Your sign in code",
    intro: "Enter this code on the Aurevia sign in page, or use the button below.",
    button: "Sign in to Aurevia",
  },
  signup: {
    subject: "Confirm your email",
    heading: "Confirm your email",
    intro: "Welcome to Aurevia Estates. Enter this code to confirm your email, or use the button below.",
    button: "Confirm my email",
  },
  recovery: {
    subject: "Reset your Aurevia password",
    heading: "Reset your password",
    intro: "Enter this code to choose a new password, or use the button below.",
    button: "Choose a new password",
  },
  // A reset for an account with no password yet (spec 0008, AC-10).
  "set-password": {
    subject: "Set your Aurevia password",
    heading: "Set your password",
    intro: "Enter this code in Aurevia to choose a password for your account, or use the button below.",
    button: "Choose a password",
  },
  reauthentication: {
    subject: "Confirm it's you",
    heading: "Confirm it's you",
    intro: "Enter this code in Aurevia to confirm the change to your account.",
    button: "",
  },
};

export function authEmailSubject(kind: AuthEmailKind) {
  return copy[kind].subject;
}

export function AuthCodeEmail({
  kind,
  code,
  link,
}: {
  kind: AuthEmailKind;
  code: string;
  // Every kind but reauthentication carries a link to `/auth/confirm`.
  link?: string;
  locale?: "en";
}) {
  const text = copy[kind];
  return (
    <Html lang="en">
      <Head />
      <Preview>{`${text.heading}: ${code}`}</Preview>
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
            {text.heading}
          </Heading>
          <Text style={{ color: brand.muted, fontSize: 15, lineHeight: "24px", margin: "0 0 24px" }}>{text.intro}</Text>
          <Section style={{ backgroundColor: brand.surface, borderRadius: 12, padding: "16px 0", textAlign: "center" }}>
            <Text style={{ color: brand.fg, fontFamily: "monospace", fontSize: 32, fontWeight: 600, letterSpacing: "0.4em", margin: 0 }}>
              {code}
            </Text>
          </Section>
          <Text style={{ color: brand.muted, fontSize: 13, margin: "12px 0 0", textAlign: "center" }}>
            The code works once, for 10 minutes.
          </Text>
          {link ? (
            <Section style={{ margin: "28px 0 0", textAlign: "center" }}>
              <Button
                href={link}
                style={{
                  backgroundColor: brand.accent,
                  borderRadius: 999,
                  color: brand.onAccent,
                  fontSize: 15,
                  fontWeight: 500,
                  padding: "14px 28px",
                }}
              >
                {text.button}
              </Button>
            </Section>
          ) : null}
          <Hr style={{ borderColor: brand.line, margin: "32px 0 16px" }} />
          <Text style={{ color: brand.muted, fontSize: 12, lineHeight: "18px", margin: 0 }}>
            If you didn&apos;t ask for this, you can ignore this email. Nobody can sign in without the code.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
