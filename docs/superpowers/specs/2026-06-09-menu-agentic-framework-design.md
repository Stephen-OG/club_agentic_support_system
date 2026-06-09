# Menu Agentic Framework Design

## Purpose

GuestOS should add a venue-managed menu feature that supports two connected jobs:

- Managers can maintain a structured menu for each venue.
- Lily can use that menu to answer guest menu questions safely in public QR chat.

This feature should follow the existing venue-management patterns in the app. A menu is a venue resource, like QR service points, locations, and opening hours. The agentic system should sit on top of that structured resource instead of trying to answer directly from messy uploads.

The approved V1 direction is **structured-first**: build the menu editor and CSV import first. Photo, PDF, and picture-based extraction should come later as an import-draft workflow that requires manager review before publishing.

## Product Direction

Add a `Menu` management surface for venues. The surface should let owners, admins, and managers create menu sections, create and edit menu items, toggle item availability, and import items from CSV.

The guest-facing behavior should feel fast and useful. If a guest asks a menu question such as `What vegan mains do you have?`, Lily should answer directly in the same public chat without creating a staff support request. This keeps the Operations queue focused on work that needs human attention.

If the guest asks for human confirmation, ordering help, severe allergy confirmation, or staff action, the system should route into the existing support request flow. The request should carry menu-specific metadata so staff can see why the menu agent escalated it.

## Scope

### In V1

- Venue-scoped menu sections.
- Venue-scoped menu items.
- Manual section and item management in the admin command UI.
- CSV import into the same structured menu tables.
- Menu Concierge framework that uses venue menu data to answer guest menu questions.
- Public QR and venue QR chat integration for direct menu replies.
- Escalation into existing support request flow for staff-action and safety-sensitive messages.
- Tests for the data model, CSV parsing, admin API, menu assistant retrieval, direct guest replies, and escalation.

### Out Of V1

- Photo upload extraction.
- PDF upload extraction.
- OCR.
- AI-generated import drafts.
- Menu item images.
- Multi-language menu translation.
- POS menu sync.

These can be added after the structured data model and menu assistant integration are stable.

## Data Model

Add two first-class Prisma models.

`MenuSection`:

- `id`
- `venueId`
- `venue`
- `name`
- `sortOrder`
- `isActive`
- `items`
- `createdAt`
- `updatedAt`

`MenuItem`:

- `id`
- `venueId`
- `venue`
- `sectionId`
- `section`
- `name`
- `description`
- `priceLabel`
- `dietaryTags`
- `allergens`
- `available`
- `sortOrder`
- `createdAt`
- `updatedAt`

`dietaryTags` and `allergens` should be stored as Prisma string arrays and returned by the API as normalized `string[]` values.

Menu items should be venue-scoped even though they also belong to a section. That keeps authorization and retrieval simple and avoids cross-venue leakage if sections are moved or edited.

## Admin API

Add venue-scoped admin endpoints under the existing authenticated `admin` surface.

- `GET /admin/venues/:venueId/menu`
- `POST /admin/venues/:venueId/menu/sections`
- `PATCH /admin/venues/:venueId/menu/sections/:sectionId`
- `POST /admin/venues/:venueId/menu/items`
- `PATCH /admin/venues/:venueId/menu/items/:itemId`
- `DELETE /admin/venues/:venueId/menu/items/:itemId`
- `POST /admin/venues/:venueId/menu/imports/csv`

The endpoints should use the existing auth context and venue membership checks. Staff should only manage menus for venues they are permitted to administer. Read-only and ordinary staff roles should not mutate menu data.

Deletes should avoid surprising data loss. V1 should archive items by marking them unavailable or inactive rather than hard-deleting them. Archived items should not be used by the menu assistant.

## CSV Import

CSV import should map into the structured menu model. The V1 column contract is:

```text
section,name,description,price,dietary_tags,allergens,available
```

Rules:

- `section` and `name` are required.
- `description`, `price`, `dietary_tags`, `allergens`, and `available` are optional.
- `dietary_tags` and `allergens` can be comma-separated or pipe-separated, then normalized to trimmed strings.
- `available` should accept common values such as `true`, `false`, `yes`, `no`, `1`, and `0`.
- Unknown columns should not break import, but should be ignored.
- Invalid rows should be reported with row numbers and reasons.

The V1 import flow should commit valid rows in one request and return invalid rows with row numbers and reasons. If every row is invalid, the import should fail without changing menu data. The UI must clearly show how many rows were imported and which rows were skipped.

## Admin UI

Add a `Menu` surface within the existing command center venue management experience.

The UI should support:

- Choosing a venue.
- Viewing sections with item counts.
- Adding and editing sections.
- Adding and editing items.
- Toggling item availability.
- Viewing dietary tags and allergens.
- Importing CSV.
- Showing row-level import errors.

The interface should be operational and compact, matching the existing command center style. It should not become a marketing-style menu page. Managers need to scan, edit, and recover from import errors quickly.

Photo and PDF upload affordances should not be active in V1 unless they are clearly marked as future work. The V1 UI should not imply that picture extraction works before the review workflow exists.

## Menu Concierge Framework

The existing `MenuAssistantService` should become the core service for a named framework:

```text
menu_concierge
```

The framework owns this flow:

```text
guest message
-> detect menu intent
-> retrieve available venue menu items
-> choose relevant items
-> answer from structured menu data
-> decide whether staff escalation is needed
-> attach audit metadata
```

The assistant must only answer from supplied menu data. It must not invent items, prices, allergens, ingredients, or availability. If dietary or allergen safety is uncertain, it should say staff should confirm before the guest orders.

The framework should record metadata on assistant replies and escalated requests:

- `agenticFramework: "menu_concierge"`
- `menuMatchedItemIds`
- `menuUsedAi`
- `menuEscalationReason` when escalated

Expected escalation reasons include:

- `allergen_confirmation`
- `ordering_help`
- `staff_action_requested`
- `no_menu_data`
- `low_confidence`

## Guest Chat Integration

Public QR and venue QR messages should check for menu intent before the normal non-request and support-request triage path.

If the message is a menu question and the venue has available menu items:

- Persist the guest message.
- Persist Lily's menu reply as an assistant message.
- Do not create a support request.
- Return the normal conversation response envelope with `replyPending: false`.

If the message requires staff help:

- Continue into the existing support request flow.
- Preserve the guest message.
- Attach menu metadata to the request or related messages.
- Let the existing Operations queue handle the request.

If no structured menu exists yet:

- Lily should not invent an answer.
- The system can use the existing venue-info/non-request behavior or escalate if the guest asks for staff help.

The direct-answer path should be synchronous. It should not depend on the async triage queue because the guest is asking for information, not starting an operational task.

## Error Handling

- Missing venue menu: do not hallucinate menu details.
- Empty sections: show an empty state in admin UI and skip them in guest answers.
- Unavailable items: do not recommend them in guest answers.
- CSV parse failure: return a clear import error without changing existing menu data.
- Partially invalid CSV: report invalid rows and make committed rows clear.
- OpenAI unavailable: use the deterministic fallback already present in the menu assistant if relevant items can be found.
- Allergen uncertainty: answer cautiously and recommend staff confirmation.
- Existing open request: staff-action menu followups should attach to or update the existing request where that matches current conversation behavior.

## Testing

Backend tests should cover:

- Menu section and item CRUD authorization.
- Venue isolation for menu reads and writes.
- CSV parser validation and normalization.
- CSV import behavior for valid, invalid, and mixed files.
- Menu assistant retrieval from structured menu items.
- Menu assistant fallback when OpenAI is unavailable.
- Direct guest-chat menu replies without creating support requests.
- Escalation path for allergy confirmation and action requests.

Frontend tests should cover:

- Menu tab rendering for venues.
- Section and item editing state.
- Availability toggles.
- CSV import success and row-level errors.
- API error display.

Regression tests should ensure existing QR service point management, opening hours, public QR chat, and venue QR chat flows continue to work.

## Future Work

Photo and PDF upload should be implemented as a reviewable import-draft workflow:

```text
upload image/PDF
-> extract text/items
-> create draft sections/items
-> show confidence and source rows
-> manager reviews and edits
-> manager publishes to structured menu
```

This future flow should still write to the same `MenuSection` and `MenuItem` tables. The menu assistant should never answer directly from an unreviewed upload.
