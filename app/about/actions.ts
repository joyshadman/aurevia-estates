"use server";

import type { ContactInput } from "@/lib/domain/contact";
import { getCurrentUser } from "@/lib/server/auth";
import { submitContact, type ContactResult } from "@/lib/server/contact";

// The contact form (spec 0014). The page never reads the session; this action
// does, only to link a signed in visitor to their lead.
export async function submitContactAction(input: ContactInput): Promise<ContactResult> {
  const visitor = await getCurrentUser();
  return submitContact(input, { visitor });
}
