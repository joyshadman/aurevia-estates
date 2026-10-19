// Booking messages (spec 0007, *Error messages*). English in every chat.
export const bookingReasonMessages: Record<string, string> = {
  not_visitor: "Only buyers can book viewings from the assistant.",
  turn_in_progress: "One moment, the assistant is still replying.",
  slot_unavailable: "That time is no longer available. Please pick another.",
  listing_unavailable: "This home can't be booked right now.",
  already_booked: "You already have a viewing for this home.",
  too_many_viewings: "You have 5 upcoming viewings. Cancel one to book another.",
  too_many_changes: "This viewing has been changed 3 times. Please contact your advisor to change it again.",
  unchanged: "That's already your viewing time.",
  lead_closed: "This enquiry is closed. Please book a new viewing.",
  too_late: "It's less than 2 hours to your viewing. Call or WhatsApp your advisor to change it.",
  stale_status: "This viewing just changed. Refresh to see it.",
  not_found: "We couldn't find that. Refresh and try again.",
  invalid: "Check the highlighted fields.",
};
