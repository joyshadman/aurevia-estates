# 0009. Agent lead inbox: rationale

The decision record behind [the build spec](index.md).

## Context

Viewings booked through the assistant are the success metric, and spec 0007 now creates them as requests an agent must confirm. Until now there was no place for agents to see those requests. `/dashboard/leads` is a placeholder, and a request nobody confirms is a lost buyer.

Agents in Sylhet coordinate by phone and WhatsApp and agree a time with the buyer in conversation, often one outside the booking slots. Buyers include families abroad. The agency is small: a handful of agents share every lead (spec 0002 lets any agent read and update all leads), and the inbox defaults to "assigned to me". Leads can arrive with no agent (a listing with no agent, or a general contact form).

The data already exists: leads with a contact snapshot and the WhatsApp flag, viewings with requested and confirmed times, an activity log, and the buyer's chat linked through the lead. Spec 0002 fixes the state machines, and spec 0008 fixes the agent gate (an authenticator code within 12 hours). What's missing is how agents find what needs them, how they record what they agreed, and how a lead and its viewings end.

## Options considered

### Option 1: Dedicated inbox and lead pages with action tabs (chosen)

A sorted table with Needs action, Upcoming, Open, and Closed tabs, and a full page per lead with every action and the chat transcript.

**Pros**: urgent work comes first; the lead page is linkable from future emails; room for the transcript and history.
**Cons**: two pages to build; triage means opening each lead.

### Option 2: Status tab table with a side drawer

Tabs by lead status (All, New, Contacted, Qualified, Won, Lost), and a drawer over the list for the lead.

**Pros**: matches the listings table; quick triage without leaving the list.
**Cons**: a CONTACTED lead with an unconfirmed viewing or a passed visit isn't flagged; a drawer is cramped for a transcript and isn't linkable.

### Option 3: Reuse the visitor's chat page for agents

Agents open `/assistant/c/<id>` read only, and the inbox is a thin list.

**Pros**: no new transcript rendering.
**Cons**: breaks spec 0006's rule that another user's conversation is a 404, and mixes agent actions into a visitor page.

## Rationale

The inbox exists to stop viewing requests and passed visits from going unattended. Tabs built on what an agent must do (new, unconfirmed, awaiting close) serve that better than tabs by lead status, where a contacted lead with a pending request looks finished. Sorting by the soonest viewing matches how agents plan their calls. A dedicated lead page keeps the transcript readable, works with the back button, and gives feature 19's emails a link.

Letting agents set any future time, and change a confirmed one directly, records what actually happened on the phone. The runner up, a proposal the buyer accepts, needs a new viewing state and notifications that don't exist yet. Closing only after the time has passed, a required cancel reason, and a reason for Lost keep the records honest at little cost. Confirming a NEW lead's viewing also marks the lead contacted, because agreeing a time is contact, and it keeps Needs action accurate. Version checks under the lead lock (the lock visitor change and cancel already take) keep two agents, or an agent and the buyer, from silently overwriting each other.

Everything fits the existing columns and activity rows, so the feature adds no migration and reuses spec 0002's writers. Offset paging and a raw SQL query are the simplest fit for a 25 row page with a mixed sort.
