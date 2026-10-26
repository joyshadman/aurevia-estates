// What the contact form says for each failure reason (spec 0015). Shared by the
// action and the client form.

export const contactMessages = {
  invalid_name: "Enter your name.",
  invalid_email: "Enter a valid email, or leave it empty.",
  invalid_phone: "Enter a valid phone number for the country you picked.",
  invalid_message: "Write a short message, up to 1,000 characters.",
  captcha_failed: "We couldn't confirm you're a person. Try again.",
  rate_limited: "Too many messages from here. Try again in an hour, or call us.",
} as const;

export type ContactReason = keyof typeof contactMessages;
