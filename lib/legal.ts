// The privacy and terms text (spec 0017, *Pages*). A starting draft written
// from what the code actually stores and sends; not legal advice. A lawyer
// reviews it before launch. Edit the words here; the pages only render them.

export type LegalDoc = {
  title: string;
  updated: string;
  intro: string;
  sections: { heading: string; body: string[] }[];
};

export const legalUpdated = "26 October 2026";

export const privacy: LegalDoc = {
  title: "Privacy",
  updated: legalUpdated,
  intro:
    "Aurevia Estates is a property agency in Sylhet. This page explains what we collect when you use this site, why, who else handles it, and how to remove it.",
  sections: [
    {
      heading: "What we collect",
      body: [
        "Your account: your email address, your name and phone number if you add them, whether that phone is on WhatsApp, and how you sign in (an email code, a password we store only as a hash, or Google). If you turn on an authenticator app we store its secret encrypted.",
        "Your chats with the Aurevia Assistant: what you write, the replies, the homes it showed you, and the search brief it keeps (area, budget, size).",
        "Viewings you book: the home, the time, your contact details, and any note you add. A copy goes to the advisor handling the home.",
        "Homes you save, and how many assistant messages you send each day (to keep the service fair).",
        "Messages you send through the contact form.",
      ],
    },
    {
      heading: "Why we use it",
      body: [
        "To run your account and keep it secure, to answer your questions and match you with homes, to arrange viewings with an advisor, and to send you emails about them (a confirmation when you book, and another when the advisor confirms).",
        "We do not sell your data and we do not use it for advertising.",
      ],
    },
    {
      heading: "Cookies and analytics",
      body: [
        "Essential cookies and browser storage keep you signed in, remember your light or dark theme, and remember your cookie choice. They are always on, because the site cannot work without them.",
        "Analytics (PostHog) is off until you choose \"Allow analytics\". It counts visits and a few steps (starting a chat, seeing homes, booking a viewing) without your name, email, phone, or chat text. You can change your choice any time from \"Cookie settings\" at the bottom of every page.",
        "Error reports (Sentry) tell us when something breaks. They carry no cookies and no account details.",
      ],
    },
    {
      heading: "Who else handles your data",
      body: [
        "We use a small number of providers to run the site: Vercel (hosting), Neon (our database), OpenRouter and the model provider it routes to (to write the assistant's replies from your messages), Resend (email), Google (if you sign in with Google, and for fonts), hCaptcha (to stop automated sign ups), Sentry (error reports), PostHog (analytics, only with your consent), and our map tile provider. Some of them process data outside Bangladesh.",
      ],
    },
    {
      heading: "How long we keep it",
      body: [
        "We keep your account, chats, and saved homes until you delete them. Viewing and lead records stay with the agency so advisors can follow up, but if you delete your account your name, phone, email, and notes are removed from them. Sent notification emails are cleared from our records after 30 days.",
      ],
    },
    {
      heading: "Your choices",
      body: [
        "You can edit your name and phone in your account, delete any chat from the assistant, and delete your whole account from the account page. Deleting your account signs you out everywhere and removes your chats, saved homes, and personal details at once.",
        "For anything else, including a copy of your data, contact us through the form on the About page.",
      ],
    },
  ],
};

export const terms: LegalDoc = {
  title: "Terms",
  updated: legalUpdated,
  intro: "These terms cover your use of the Aurevia Estates website and the Aurevia Assistant.",
  sections: [
    {
      heading: "Listings",
      body: [
        "Every listing is prepared and checked by an Aurevia agent, but prices, sizes, and availability can change and may contain mistakes. Confirm the details with your advisor and in the documents before you make any decision or payment.",
      ],
    },
    {
      heading: "The Aurevia Assistant",
      body: [
        "The assistant is an AI. It answers from our listings and fact sheet and can be wrong. It does not give legal, financial, or tax advice, and nothing it says is an offer or a promise. A viewing is booked only when you confirm it yourself, and an advisor then confirms the time.",
        "There is a daily limit on assistant messages to keep the service fair for everyone.",
      ],
    },
    {
      heading: "Your account",
      body: [
        "Keep your sign in details safe; you are responsible for what happens on your account. Give accurate contact details when you book a viewing. Don't misuse the site: no automated scraping, no attempts to break in, and no abusive messages to the assistant or our advisors. We may suspend accounts that do.",
      ],
    },
    {
      heading: "Viewings",
      body: [
        "You can change or cancel a viewing up to 2 hours before it starts. Please let us know if you can't make it.",
      ],
    },
    {
      heading: "Changes and contact",
      body: [
        "We may update these terms; the date at the top shows the latest version. Questions are welcome through the form on the About page.",
      ],
    },
  ],
};
