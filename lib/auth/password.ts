import { z } from "zod";

// The password rule (spec 0004, AC-3): 8 or more characters with at least one
// letter and one digit. Better Auth checks only the length, so the actions check
// this rule (spec 0008), and the form says so before a round trip.
export const passwordRule = z
  .string()
  .min(8)
  .max(72)
  .regex(/\p{L}/u)
  .regex(/\d/);

export function isStrongPassword(value: string) {
  return passwordRule.safeParse(value).success;
}
