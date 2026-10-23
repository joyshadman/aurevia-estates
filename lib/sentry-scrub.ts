import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

// `/auth/confirm` links carry the email and a live sign in code (spec 0008,
// *Key invariants*). Sentry never gets their query string: the server and
// browser configs pass every event and breadcrumb through here.

const confirmUrl = /\/auth\/confirm(?=[?#]|$)/;

const strip = (url: string) => (confirmUrl.test(url) ? url.replace(/[?#].*$/, "") : url);

export function scrubAuthLinks(event: ErrorEvent): ErrorEvent {
  if (event.request?.url && confirmUrl.test(event.request.url)) {
    event.request.url = strip(event.request.url);
    delete event.request.query_string;
  }
  return event;
}

export function scrubAuthBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const data = breadcrumb.data;
  if (data) {
    for (const key of ["url", "from", "to"] as const) {
      if (typeof data[key] === "string") data[key] = strip(data[key]);
    }
  }
  if (breadcrumb.message) breadcrumb.message = breadcrumb.message.replace(/\/auth\/confirm\?\S*/g, "/auth/confirm");
  return breadcrumb;
}
