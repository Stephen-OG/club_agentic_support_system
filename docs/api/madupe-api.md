# Madupe API

## Public Venue Intake

Public service-point QR pages live at `/qr/:token`.

`POST /public/qr/:token/messages`

Accepts a message from a QR code attached to a service point such as a VIP table, booth, bar area, or room.

`GET /public/qr/:token/conversations/:conversationId`

Returns the latest service-point conversation state for guest polling. Send the guest session in the `X-Guest-Session` header; do not put it in the URL.

Public venue QR pages live at `/venue/:slug`.

`GET /public/qr/venues/:venueSlug`

Returns public venue intake details and quick actions.

`POST /public/qr/venues/:venueSlug/messages`

Accepts a venue QR guest message.

`GET /public/qr/venues/:venueSlug/conversations/:conversationId`

Returns the latest venue QR conversation state for guest polling. Send the guest session in the `X-Guest-Session` header; do not put it in the URL.

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
