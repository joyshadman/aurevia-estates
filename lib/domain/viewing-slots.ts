import { activeViewingStatuses } from "@/lib/domain/viewing-status";
import type { ViewingStatus } from "@/lib/generated/prisma/enums";

// Viewing slots and the visitor's booking rules (spec 0007, *Slots*). Pure, so
// the booking card and the server share one definition. All times are
// Asia/Dhaka, which is UTC+6 all year (no daylight saving).

export const VIEWING_SLOT_TIMES = ["10:00", "12:00", "15:00", "17:00"] as const;
export const VIEWING_DAYS_AHEAD = 14;
// 5 = Friday, as `Date.getUTCDay()` counts.
export const VIEWING_CLOSED_WEEKDAYS: readonly number[] = [5];

// AC-9, AC-10.
export const VISITOR_CHANGE_CUTOFF_MS = 2 * 60 * 60 * 1000;
export const MAX_ACTIVE_VIEWINGS = 5;
export const MAX_VISITOR_CHANGES = 3;

// The writer of a visitor's reschedule and the change cap count read this one
// value (spec 0007, *Data model*). Agents (feature 9) use "Rescheduled".
export const VISITOR_RESCHEDULE_REASON = "Rescheduled by visitor";
export const VISITOR_CANCEL_REASON = "Cancelled by visitor";

export const DHAKA_TIME_ZONE = "Asia/Dhaka";
const dhakaOffsetMinutes = 6 * 60;

export type ViewingSlot = { start: string; date: string; time: string };

// Today's calendar date in Asia/Dhaka, "YYYY-MM-DD".
export function dhakaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: DHAKA_TIME_ZONE, dateStyle: "short" }).format(now);
}

function addDays(date: string, days: number): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days));
}

// ---------------------------------------------------------------------------
// The time an agent agreed with the buyer by phone (spec 0009, *Times*): any
// Dhaka day from today through today + 30, in 15 minute steps.

export const AGENT_VIEWING_DAYS_AHEAD = 30;

export const AGENT_TIME_STEPS: readonly string[] = Array.from({ length: 96 }, (_, index) => {
  const minutes = index * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

// The instant of a Dhaka date ("YYYY-MM-DD") and time ("HH:mm") at UTC+6.
export function dhakaInstant(date: string, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(addDays(date, 0).getTime() + (hours * 60 + minutes - dhakaOffsetMinutes) * 60_000);
}

// The dates the agent's picker offers, today first.
export function agentViewingDates(now = new Date()): string[] {
  const today = dhakaToday(now);
  return Array.from({ length: AGENT_VIEWING_DAYS_AHEAD + 1 }, (_, offset) => addDays(today, offset).toISOString().slice(0, 10));
}

// The Dhaka date and time of an instant, to prefill the picker.
export function dhakaDateTime(at: Date | string): { date: string; time: string } {
  const local = new Date(new Date(at).getTime() + dhakaOffsetMinutes * 60_000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

// "15:45" → "3:45 PM".
export function formatTimeStep(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

// AC-3: every Dhaka day from tomorrow through today + 14, closed weekdays
// skipped, at each slot time; `start` is the UTC instant.
export function availableSlots(now = new Date()): ViewingSlot[] {
  const today = dhakaToday(now);
  const slots: ViewingSlot[] = [];
  for (let offset = 1; offset <= VIEWING_DAYS_AHEAD; offset++) {
    const day = addDays(today, offset);
    if (VIEWING_CLOSED_WEEKDAYS.includes(day.getUTCDay())) continue;
    const date = day.toISOString().slice(0, 10);
    for (const time of VIEWING_SLOT_TIMES) {
      const [hours, minutes] = time.split(":").map(Number);
      const start = new Date(day.getTime() + (hours * 60 + minutes - dhakaOffsetMinutes) * 60_000);
      slots.push({ start: start.toISOString(), date, time });
    }
  }
  return slots;
}

// Compares instants, never strings, so "+06:00" or missing milliseconds still match.
export function isAvailableSlot(start: Date, now = new Date()): boolean {
  const time = start.getTime();
  return availableSlots(now).some((slot) => new Date(slot.start).getTime() === time);
}

type TimedViewing = { status: ViewingStatus; requestedFor: Date | string; confirmedFor: Date | string | null };

export function viewingStart(viewing: Pick<TimedViewing, "requestedFor" | "confirmedFor">): Date {
  return new Date(viewing.confirmedFor ?? viewing.requestedFor);
}

export function isActiveViewing(status: ViewingStatus): boolean {
  return (activeViewingStatuses as readonly ViewingStatus[]).includes(status);
}

// AC-9: active, and more than 2 hours before its start.
export function canVisitorChange(viewing: TimedViewing, now = new Date()): boolean {
  return isActiveViewing(viewing.status) && viewingStart(viewing).getTime() - now.getTime() > VISITOR_CHANGE_CUTOFF_MS;
}

// "Sun 19 Oct, 3:00 PM" in the given zone (spec 0007, *Cards and history*: English, 12 hour).
export function formatViewingTime(start: Date | string, timeZone: string = DHAKA_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(start));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}, ${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()}`;
}

// "3:00 PM" in the given zone.
export function formatClock(start: Date | string, timeZone: string = DHAKA_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(start));
}

// "Sat 24 Oct" for a slot's Dhaka date ("YYYY-MM-DD").
export function formatSlotDay(date: string): string {
  return formatViewingTime(`${date}T06:00:00Z`).split(",")[0];
}

// The UTC offset of a zone at an instant, in minutes. AC-3: the local time
// shows only when this differs from Dhaka's, so a zone alias shows nothing extra.
export function zoneOffsetMinutes(timeZone: string, at: Date | string): number {
  const date = new Date(at);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - Math.floor(date.getTime() / 60_000) * 60_000) / 60_000);
}

export function differsFromDhaka(timeZone: string, at: Date | string): boolean {
  return zoneOffsetMinutes(timeZone, at) !== dhakaOffsetMinutes;
}

// "Europe/London" → "London", for "5:00 AM London".
export function zoneCity(timeZone: string): string {
  return (timeZone.split("/").at(-1) ?? timeZone).replace(/_/g, " ");
}
