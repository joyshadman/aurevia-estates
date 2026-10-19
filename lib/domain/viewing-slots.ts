// Viewing slots (spec 0007, *Slots*, AC-3). Pure: the card, the server, and the
// tests share it. Asia/Dhaka is UTC+6 all year (no daylight saving).

export const VIEWING_SLOT_TIMES = ["10:00", "12:00", "15:00", "17:00"] as const;
export const VIEWING_DAYS_AHEAD = 14;
// 0 is Sunday; Friday is closed.
export const VIEWING_CLOSED_WEEKDAYS = [5] as const;
// Visitors change or cancel only more than 2 hours before the start (AC-9).
export const VISITOR_CHANGE_CUTOFF_MS = 2 * 60 * 60 * 1000;
// Caps (AC-10).
export const MAX_ACTIVE_VIEWINGS = 5;
export const MAX_VISITOR_CHANGES = 3;
export const RESCHEDULED_BY_VISITOR = "Rescheduled by visitor";
export const CANCELLED_BY_VISITOR = "Cancelled by visitor";

const dhakaOffsetMs = 6 * 60 * 60 * 1000;
const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" });

export type Slot = { start: string; date: string; time: string };

// The calendar date of `now` in Asia/Dhaka, as YYYY-MM-DD.
export function dhakaToday(now: Date): string {
  return dateFormat.format(now);
}

function addDays(date: string, days: number): { date: string; weekday: number } {
  const [y, m, d] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return { date: utc.toISOString().slice(0, 10), weekday: utc.getUTCDay() };
}

// Every slot from tomorrow through today + 14 days in Dhaka, Fridays skipped.
export function availableSlots(now: Date): Slot[] {
  const today = dhakaToday(now);
  const slots: Slot[] = [];
  for (let offset = 1; offset <= VIEWING_DAYS_AHEAD; offset++) {
    const { date, weekday } = addDays(today, offset);
    if ((VIEWING_CLOSED_WEEKDAYS as readonly number[]).includes(weekday)) continue;
    for (const time of VIEWING_SLOT_TIMES) {
      const [h, min] = time.split(":").map(Number);
      const [y, m, d] = date.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 1, d, h, min) - dhakaOffsetMs).toISOString();
      slots.push({ start, date, time });
    }
  }
  return slots;
}

// The server accepts only an exact instant from the current set (AC-3).
export function isAvailableSlot(start: string, now: Date): boolean {
  const instant = new Date(start);
  if (Number.isNaN(instant.getTime())) return false;
  const iso = instant.toISOString();
  return availableSlots(now).some((slot) => slot.start === iso);
}

export type ViewingTimes = { status: string; requestedFor: Date | string; confirmedFor: Date | string | null };

export function viewingStart(viewing: ViewingTimes): Date {
  return new Date(viewing.confirmedFor ?? viewing.requestedFor);
}

export function isActiveViewing(status: string): boolean {
  return status === "REQUESTED" || status === "CONFIRMED";
}

export function canVisitorChange(viewing: ViewingTimes, now: Date): boolean {
  return isActiveViewing(viewing.status) && viewingStart(viewing).getTime() - now.getTime() > VISITOR_CHANGE_CUTOFF_MS;
}

// "Sun 19 Oct, 3:00 PM" in a given zone (English by the engineer's choice).
export function formatViewingTime(start: Date | string, timeZone = "Asia/Dhaka"): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(start));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}, ${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()}`;
}
