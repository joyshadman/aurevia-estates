// The name to show for a person (spec 0008, *Data model*). `full_name` is ''
// when not set, because Better Auth requires a name string; fall back to the email.
export function displayName(profile: { fullName: string; email: string }): string {
  return profile.fullName.trim() || profile.email;
}
