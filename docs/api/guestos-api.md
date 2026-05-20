# GuestOS API

## Public Venue Intake

`GET /public/qr/venues/:venueSlug`

Returns public venue intake details and quick actions.

`POST /public/qr/venues/:venueSlug/messages`

Accepts a venue QR guest message.

Request body:

```json
{
  "message": "My drinks never came",
  "conversationId": "optional-uuid",
  "sessionId": "guest-session-12345",
  "locationLabel": "Table 14",
  "quickAction": "missing_order"
}
```

Response:

```json
{
  "conversationId": "uuid",
  "messages": [],
  "request": {
    "id": "uuid",
    "status": "NEW",
    "priority": "HIGH",
    "guestLocationLabel": "Table 14",
    "agentPolicyVersion": "v1-semi-autonomous"
  },
  "servicePoint": {
    "label": "Venue support"
  }
}
```

## Operations Requests

`GET /venues/:venueId/requests`

Returns requests with `satisfactionRating`, `recentMessages`, `guestLocationLabel`, assignment, service point, and agent metadata.

## Agent Policy

Supported policy versions:

- `v1-assistive`
- `v1-semi-autonomous`
- `v2-autonomous-within-rules`

Semi-autonomous mode can send safe routine replies and assign low-risk requests inside manager-defined rules.
