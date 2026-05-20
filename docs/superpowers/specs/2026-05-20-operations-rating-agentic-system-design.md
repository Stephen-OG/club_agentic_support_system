# Operations Rating And Agentic System Design

## Purpose

The Operations tab should make guest satisfaction ratings visible where admins and managers already manage live support requests. Ratings are currently collected when a guest confirms a completed request as resolved. This feature turns that feedback into an operational signal: each request shows its latest rating, the tab summarizes venue-level rating health, and the AI agent panel explains how the agentic system uses those signals to support staff decisions.

The public guest experience should become a conversational support system for pubs, clubs, bars, and venues. A guest scans a venue QR code, describes what they need, gives their location or table when needed, and the LLM helps turn that conversation into a structured support request.

## Product Direction

Use the approved **rating-led operations overview** direction.

The Operations tab remains a dense command-center surface. The new UI should feel like part of the existing dark operational dashboard: compact metrics, crisp status chips, conversational request cards, and practical recovery cues. Ratings should not become a separate analytics page in this slice. They should sit directly inside the request workflow so staff can see service quality while handling the queue.

The public client UI should feel like support, not a blank chatbot. It should guide guests with quick problem choices, clear status updates, staff/agent replies, and completion/rating actions. The LLM makes the interaction conversational, but the interface should keep the guest moving quickly in noisy, low-attention environments.

The default QR model should be **venue QR first**. One QR code can work from anywhere in the venue and ask the guest where they are. Area QR and table QR remain optional enhancements for venues that want automatic location context.

## User Experience

### Venue QR Conversational Intake

The default public QR code should represent the venue, not a single table. This reduces venue setup friction because the same QR can be placed on posters, menus, table tents, bar screens, receipts, entry points, booking confirmations, and social pages.

After scan, the guest sees a support-style intake:

- A greeting that makes clear the venue team can help.
- Quick problem buttons for common pub/club issues.
- A conversational prompt for extra details.
- A location prompt when location is missing.
- A visible request status once the request is created.

The agent should ask for location in a flexible way:

- Table number.
- Bar area.
- Dance floor.
- VIP booth.
- Outside or smoking area.
- Toilet/restroom.
- Entrance or queue.
- Other/free text.
- Not seated.

Optional QR modes:

- Venue QR: default, no automatic table context.
- Area QR: optional, pre-fills an area such as bar, VIP, terrace, toilets, or entry.
- Table/service-point QR: optional, pre-fills exact service point for venues that want table-level routing.

### Common Guest Problems

The intake flow should support common pub and club problems as first-class categories:

- Get a drink.
- Missing or wrong order.
- Long wait.
- Spill or broken glass.
- Dirty table or area.
- Lost property.
- Payment or bill issue.
- Toilet/restroom problem.
- Accessibility help.
- VIP or table service help.
- Harassment or safety concern.
- Medical/security emergency.
- General help.

Safety, medical, harassment, fights, broken glass, fire, smoke, and security issues should escalate immediately. Routine service issues can be handled conversationally and routed to staff.

### Rating Metrics

The top metric strip should include rating-focused cards for the selected venue:

- Average rating, shown as one decimal when at least one request is rated.
- Rated request count.
- Low-rating count for ratings of 1 or 2.
- High-rating percentage for ratings of 4 or 5.

If no requests are rated, the average card should show an explicit empty state such as `No ratings`, and the supporting copy should make clear that guest ratings arrive after completed requests are confirmed.

### Request Rows

Each request row in the Operations queue should show the latest satisfaction rating for that request when available.

States:

- Rated request: show a compact star/rating chip such as `4/5`.
- Completed or resolved request with no rating: show `Not rated`.
- Open request with no rating yet: show a subdued `Awaiting completion` chip.

Low ratings should be visually easy to notice without looking like a destructive error. Use the existing warning/danger palette with restraint.

### Conversational Requests

Requests should feel like live conversations, not static tickets. Each request card or expanded row should expose enough thread context for an operator to understand what happened without opening another page.

The Operations UI should show:

- The latest guest message or latest conversation excerpt.
- The latest staff/system response when available.
- A compact message count or last-activity timestamp.
- A reply affordance or clear path to continue the conversation from Operations.
- The LLM's structured interpretation when available: category, priority, location, confidence, and suggested next action.

The request should preserve both the raw conversation and the structured request state. Staff should be able to understand what the guest said, what the LLM inferred, and what action has already been taken.

For crowded queue rows, use a two-level pattern:

- Collapsed row: request title, service point, status, priority, rating chip, and latest-message preview.
- Expanded/detail area: short message timeline and staff reply controls.

### Agentic System Panel

The right-side Operations panel should become an AI agent loop panel with three plain-language steps:

- `Observe`: the agent watches request status, priority, wait time, service point, category, guest rating, and recent conversation activity.
- `Decide`: the agent identifies low-rated resolved requests, repeated categories, stale conversations, and possible recovery moments.
- `Act`: the agent recommends staff-approved recovery actions, follow-ups, or conversation replies.

The panel must be transparent about authority. In semi-autonomous mode, the agent may send safe routine replies or assign low-risk requests only when the active venue policy allows it. It must not silently change request statuses, assign staff, or message guests outside the approved policy.

### Agent Autonomy Versions

The SaaS should support versioned agent policies so venues can move from assisted operation to more autonomous operation without changing products.

`v1-assistive`:

- LLM drafts replies, summarizes, classifies, and recommends assignment.
- Staff approves sends, assignments, and status changes.

`v1-semi-autonomous`:

- Default target mode for this feature.
- LLM can send safe routine replies.
- LLM can classify category, infer location, set priority, and create/update structured request fields.
- LLM can recommend assignment or auto-assign low-risk routine requests inside manager-defined rules.
- Staff or manager approves escalations, payment-sensitive actions, security decisions, refunds, final closures, and uncertain cases.

`v2-autonomous-within-rules`:

- Future mode.
- LLM can handle routine requests end-to-end inside venue rules.
- LLM can reply, assign, reopen, escalate, and mark routine requests handled when policy allows.
- Risky categories, low confidence, low ratings, and repeated complaints still escalate.

Each policy version should define allowed actions, blocked actions, confidence thresholds, escalation rules, token/spend limits, and audit requirements.

### Assignment Policy

Staff assignment should be hybrid:

- Managers define assignment rules by venue, zone, role, category, and workload.
- In semi-autonomous mode, the agent can auto-assign low-risk routine requests only inside those rules.
- The agent should recommend assignment when rules are incomplete or confidence is low.
- Security, medical, harassment, payment disputes, VIP complaints, and low-rated recovery should escalate to a manager or permitted role.

Every agent assignment or recommendation should include an audit reason, such as `nearest zone`, `category owner`, `low workload`, `security category`, or `manager approval required`.

## Data And API

Guest ratings are currently stored on system messages created by the public request action flow. The relevant metadata key is `satisfactionRating`, with valid values from 1 to 5.

The conversational intake API should support venue QR sessions where location may be unknown at the start. The LLM should collect or infer enough detail to create a structured request, but the system must preserve the original message text and conversation history.

The venue request listing API should return each support request with an optional `satisfactionRating` field. The API derives this from the latest valid rating-bearing message for that request. Keeping this derivation server-side gives the dashboard a simple typed field and avoids duplicating message-metadata extraction in the browser.

Implementation target:

- Update `RequestsService.listForVenue` to include enough message data to determine the latest valid rating for each request.
- Include enough recent message data for conversational request previews and expanded request details.
- Normalize only integer values from 1 through 5.
- Ignore invalid, missing, or malformed metadata.
- Return `satisfactionRating: number | null` on each request object.
- Return recent messages or a typed conversation preview for each request. Do not generate a fresh LLM summary on every request-list read; generated summaries should come from an explicit agent action or cached agent metadata.
- Update the web command request type to include `satisfactionRating?: number | null`.
- Add or extend public intake endpoints so a venue QR session can create conversations without a table-specific QR token.
- Store guest-provided or agent-inferred location separately from fixed service point context.
- Store agent policy version and agent action metadata with request events.

If the API later adds a first-class request rating column, the frontend should not need a visual redesign. It can continue reading the same `satisfactionRating` response field.

## API Surface

The project should document and keep evolving the SaaS API around these surfaces:

- `GET /venues/:venueId/requests`: returns request list, latest rating, assignment, service point or location, recent messages, and agent state.
- `GET /requests/:requestId`: returns request detail and full conversation timeline.
- `POST /requests/:requestId/messages`: sends staff or agent messages.
- `PATCH /requests/:requestId/status`: updates request lifecycle status.
- `PATCH /requests/:requestId/assignment`: assigns staff manually or through permitted agent policy.
- `POST /requests/:requestId/agent/actions`: runs an approved agent action such as reply, assign, escalate, reopen, summarize, or mark handled.
- `GET /venues/:venueId/agent-policy`: returns current autonomy mode and rules.
- `PATCH /venues/:venueId/agent-policy`: updates allowed actions, thresholds, assignment rules, spend limits, and escalation rules.
- `GET /public/venues/:venueSlug`: starts or describes a venue QR intake session.
- `POST /public/venues/:venueSlug/messages`: sends a guest message into the venue-level conversational intake.

## Frontend Calculations

The Operations tab can calculate venue-level rating analytics from the loaded request list:

- `averageRating`
- `ratedCount`
- `lowRatingCount`
- `highRatingCount`
- `highRatingPercent`

Unrated requests are excluded from rating averages and high/low percentages. The UI should still make the unrated count visible through the rated request count and request-row states.

The existing `apps/web/lib/rating-analytics.ts` helper can be reused or adapted, but the command-center API uses camelCase fields, so the implementation should avoid leaking old snake_case names into the new UI.

## Error Handling And Edge Cases

- No ratings: show a clear empty metric state instead of `0.0`.
- Multiple rating messages for one request: latest valid rating wins.
- Invalid rating metadata: ignore it.
- API request failure: preserve the existing Operations error banner behavior.
- Loading state: keep existing refresh/loading behavior; do not show fake rating values.
- Low ratings: highlight them, but do not automatically reopen requests.
- Missing message history: still render the request row with title, status, priority, and rating state.
- Missing guest location: keep the conversation open and prompt the guest for a table, area, or free-text location.
- Low LLM confidence: ask a clarifying question or escalate to staff instead of guessing.
- Safety/security terms: escalate immediately and avoid over-conversational delays.

## Agentic System Boundaries

This feature should fit and extend the app's current AI capabilities:

- Priority classification already supports request triage.
- Reply guard and AI triage services support safer assistant behavior.
- Rating monitoring should be presented as the next operational signal the agent observes.
- Conversational intake should add LLM-backed request handling for venue-level QR sessions.

Agent actions should require explicit product rules, permission checks, audit events, staff approval states where appropriate, rate limits, and usage logging.

## Testing Strategy

Backend tests should cover:

- Returning `satisfactionRating` for requests with valid rating metadata.
- Choosing the latest valid rating when multiple messages exist.
- Ignoring invalid ratings.
- Preserving existing venue access behavior.
- Returning conversation preview data.
- Venue QR intake without a table-specific service point token.
- Location collection for unknown table/area.
- Agent policy enforcement for semi-autonomous actions.
- Audit events for agent replies, assignment, escalation, and policy-blocked actions.

Frontend tests should cover:

- Rating analytics for average, high ratings, low ratings, and unrated requests.
- Rendering rated request rows.
- Rendering unrated request rows.
- Rendering latest-message previews and expanded conversation details.
- Rendering venue QR support intake quick actions.
- Rendering location prompts and request status in the client UI.
- Empty rating metric states.

## Out Of Scope

- A separate analytics page.
- Free-text guest reviews.
- Staff editing guest ratings.
- Autonomous actions outside the selected agent policy.
- New database columns for ratings.
- Notification workflows for low ratings.

## Acceptance Criteria

- The Operations tab shows venue-level rating metrics.
- Each request can show its latest guest satisfaction rating.
- Unrated requests have a clear state.
- The AI agent panel explains observe, decide, and act behavior in terms of this app's request workflow.
- Request rows show conversational context from existing messages.
- The public client UI feels like a support system with quick issue choices, conversational follow-ups, and request status.
- Venue QR is the default public intake mode, with optional area/table QR support.
- The LLM can handle semi-autonomous conversational intake and safe routine replies.
- Agent actions are constrained by versioned policy and audit logs.
- Ratings are derived from existing guest action metadata.
- Tests cover rating derivation and frontend rating analytics.
