import "server-only";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/server/env";
import { reportError } from "@/lib/server/report";

// hCaptcha for the public contact form (spec 0014). Both keys must be set; until
// then the form is off and every check fails closed.

export function captchaEnabled(): boolean {
  return Boolean(publicEnv().NEXT_PUBLIC_HCAPTCHA_SITE_KEY && serverEnv().HCAPTCHA_SECRET);
}

export type CaptchaVerifier = (token: string) => Promise<boolean>;

export const verifyCaptcha: CaptchaVerifier = async (token) => {
  const secret = serverEnv().HCAPTCHA_SECRET;
  const sitekey = publicEnv().NEXT_PUBLIC_HCAPTCHA_SITE_KEY;
  if (!secret || !sitekey || !token || token.length > 4096) return false;
  try {
    const response = await fetch("https://api.hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, sitekey, response: token }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch (error) {
    reportError(error, { where: "captcha.verify" });
    return false;
  }
};
