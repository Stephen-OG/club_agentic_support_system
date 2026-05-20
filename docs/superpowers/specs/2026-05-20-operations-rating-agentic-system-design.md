# Operations Rating And Agentic System Design

## Purpose

The Operations tab should make guest satisfaction ratings visible where admins and managers already manage live support requests. Ratings are currently collected when a guest confirms a completed request as resolved. This feature turns that feedback into an operational signal: each request shows its latest rating, the tab summarizes venue-level rating health, and the AI agent panel explains how the agentic system uses those signals to support staff decisions.

## Product Direction

Use the approved **rating-led operations overview** direction.

The Operations tab remains a dense command-center surface. The new UI should feel like part of the existing dark operational dashboard: compact metrics, crisp status chips, conversational request cards, and practical recovery cues. Ratings should not become a separate analytics page in this slice. They should sit directly inside the request workflow so staff can see service quality while handling the queue.

The first version should add **no new token spend**. It can explain the agentic system and surface conversation context using existing request, message, status, priority, and rating data. Future model-backed agent actions can be added later behind rate limits, logging, and approval workflows.

## User Experience

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

The Operations UI should use existing stored messages to show:

- The latest guest message or latest conversation excerpt.
- The latest staff/system response when available.
- A compact message count or last-activity timestamp.
- A reply affordance or clear path to continue the conversation from Operations.

The conversational summary in this slice should be deterministic: use existing message bodies, request title, status, and category. Do not call an AI model to summarize conversations in version one.

For crowded queue rows, use a two-level pattern:

- Collapsed row: request title, service point, status, priority, rating chip, and latest-message preview.
- Expanded/detail area: short message timeline and staff reply controls.

### Agentic System Panel

The right-side Operations panel should become an AI agent loop panel with three plain-language steps:

- `Observe`: the agent watches request status, priority, wait time, service point, category, guest rating, and recent conversation activity.
- `Decide`: the agent identifies low-rated resolved requests, repeated categories, stale conversations, and possible recovery moments.
- `Act`: the agent recommends staff-approved recovery actions, follow-ups, or conversation replies.

The panel must be transparent about authority. In this slice, the agent recommends and explains; it does not silently change request statuses, assign staff, or message guests without an explicit approved workflow.

## Data And API

Guest ratings are currently stored on system messages created by the public request action flow. The relevant metadata key is `satisfactionRating`, with valid values from 1 to 5.

The venue request listing API should return each support request with an optional `satisfactionRating` field. The API derives this from the latest valid rating-bearing message for that request. Keeping this derivation server-side gives the dashboard a simple typed field and avoids duplicating message-metadata extraction in the browser.

Implementation target:

- Update `RequestsService.listForVenue` to include enough message data to determine the latest valid rating for each request.
- Include enough recent message data for conversational request previews and expanded request details.
- Normalize only integer values from 1 through 5.
- Ignore invalid, missing, or malformed metadata.
- Return `satisfactionRating: number | null` on each request object.
- Return recent messages or a typed conversation preview for each request without adding model-generated summaries.
- Update the web command request type to include `satisfactionRating?: number | null`.

If the API later adds a first-class request rating column, the frontend should not need a visual redesign. It can continue reading the same `satisfactionRating` response field.

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

## Agentic System Boundaries

This feature should fit the app's current AI capabilities:

- Priority classification already supports request triage.
- Reply guard and AI triage services support safer assistant behavior.
- Rating monitoring should be presented as the next operational signal the agent observes.

The first UI slice should not introduce autonomous side effects or new token-consuming AI calls. Any future action loop should require explicit product rules, permission checks, audit events, staff approval states, rate limits, and usage logging.

## Testing Strategy

Backend tests should cover:

- Returning `satisfactionRating` for requests with valid rating metadata.
- Choosing the latest valid rating when multiple messages exist.
- Ignoring invalid ratings.
- Preserving existing venue access behavior.
- Returning conversation preview data without requiring AI-generated summaries.

Frontend tests should cover:

- Rating analytics for average, high ratings, low ratings, and unrated requests.
- Rendering rated request rows.
- Rendering unrated request rows.
- Rendering latest-message previews and expanded conversation details.
- Empty rating metric states.

## Out Of Scope

- A separate analytics page.
- Free-text guest reviews.
- Staff editing guest ratings.
- Autonomous agent actions.
- AI-generated conversation summaries.
- New token-consuming model calls for this first version.
- New database columns for ratings.
- Notification workflows for low ratings.

## Acceptance Criteria

- The Operations tab shows venue-level rating metrics.
- Each request can show its latest guest satisfaction rating.
- Unrated requests have a clear state.
- The AI agent panel explains observe, decide, and act behavior in terms of this app's request workflow.
- Request rows show conversational context from existing messages.
- The first version adds no new token spend.
- Ratings are derived from existing guest action metadata.
- Tests cover rating derivation and frontend rating analytics.
