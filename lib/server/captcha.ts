import "server-only";
import { publicEnv } from "@/lib/env";
import { captchaEnv } from "@/lib/server/env";
import { reportError } from "@/lib/server/report";

// Our own hCaptcha check (spec 0008, AC-4). Every public auth action calls it
// once before calling Better Auth, so each single use token is spent exactly
// once. Fails closed: no answer means no.

const siteverifyUrl = "https://api.hcaptcha.com/siteverify";
const timeoutMs = 5000;

export async function verifyCaptcha(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const response = await fetch(siteverifyUrl, {
      method: "POST",
      body: new URLSearchParams({
        secret: captchaEnv().HCAPTCHA_SECRET,
        response: token,
        sitekey: publicEnv().NEXT_PUBLIC_HCAPTCHA_SITE_KEY,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch (error) {
    reportError("auth.captcha_unreachable", error);
    return false;
  }
}
