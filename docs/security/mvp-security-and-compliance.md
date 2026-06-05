# MVP Security And Compliance Checklist

This checklist maps Madupe MVP controls to the OWASP Top 10 2021 categories referenced by OWASP and Cloudflare.

Sources:
- OWASP Top 10 2021: https://owasp.org/Top10/2021/
- Cloudflare OWASP Top 10 overview: https://www.cloudflare.com/learning/security/threats/owasp-top-10/

## Implemented Controls

### Sensitive Data Protection

- Guest/staff chat message bodies are encrypted at rest using AES-256-GCM before storage.
- Encrypted message bodies use a versioned envelope: `enc:v1:<iv>:<tag>:<ciphertext>`.
- Legacy plaintext messages remain readable so production can migrate without breaking active conversations.
- Production API startup requires `MESSAGE_ENCRYPTION_KEY`.
- Public conversation polling uses the `X-Guest-Session` header instead of URL query parameters.
- HTTP request logs strip query strings before writing structured request events.

Deployment requirement:

```bash
MESSAGE_ENCRYPTION_KEY="$(openssl rand -base64 32)"
```

Keep this key in the hosting provider secret manager. Do not commit it to Git or expose it to the browser.

### Broken Access Control

- Staff/admin APIs require authenticated context.
- Venue access checks enforce workspace and venue boundaries.
- Public guest request actions require the guest session id when the conversation has one.
- Public conversation reads are scoped to the QR token or venue support point plus guest session id.

### Cryptographic Failures

- Message encryption uses authenticated encryption, so tampered ciphertext fails to decrypt.
- API docs are hidden in production unless explicitly enabled.
- Production should use HTTPS only through the hosting provider/load balancer.

### Injection

- Prisma is used for database access instead of manual SQL string assembly.
- DTO validation uses whitelist and forbid-non-whitelisted globally.
- User message text is not trusted as executable input.

### Security Misconfiguration

- Production startup fails if launch-critical API configuration is missing, including `DATABASE_URL`, Supabase admin credentials, `OPENAI_API_KEY`, `MESSAGE_ENCRYPTION_KEY`, `REDIS_URL`, and `CORS_ORIGINS`.
- Production startup fails if `NEXT_PUBLIC_SUPABASE_URL` or `CORS_ORIGINS` are not public HTTPS URLs.
- CORS is allow-list based via `CORS_ORIGINS`.
- API security headers include no-sniff, frame denial, strict referrer policy, and restricted permissions policy.
- Swagger docs are disabled by default in production.

### Identification And Authentication Failures

- Supabase session handling gates admin/staff screens.
- Route guards should keep returning users to login instead of hanging on loading shells.
- Production must disable dev auth shortcuts if any local-only guard is enabled in development.

### Security Logging And Monitoring Failures

- Request lifecycle events are written as `requestEvent` records.
- Request, message, and escalation domain events are mirrored into `AuditLog` records without raw guest message bodies.
- HTTP access logs redact query strings so guest session IDs and other URL secrets are not persisted.
- Next step: add security audit events for failed guest session checks, forbidden venue access, login failures, and rate-limit denials.

### Server-Side Request Forgery

- Current MVP does not expose arbitrary URL fetches to users.
- If future integrations add webhook/POS URLs, validate destination hosts against an allow-list and block private IP ranges.

## MVP Pre-Deploy Checklist

- Set `NODE_ENV=production`.
- Set `MESSAGE_ENCRYPTION_KEY` with a 32-byte random key.
- Set `CORS_ORIGINS` to the production web URL only.
- Set `REDIS_URL`; production startup intentionally fails without it.
- Keep `ENABLE_API_DOCS` unset unless temporarily debugging a private environment.
- Verify Supabase RLS/auth policies for any direct client-side Supabase access.
- Run database migrations before switching traffic.
- Confirm backups are enabled for Supabase Postgres.
- Confirm logs do not include raw guest messages, Supabase service keys, OpenAI keys, or encryption keys.
- Confirm public conversation URLs do not include `sessionId` query parameters.

## Recommended Next Controls

- Add auth and denial audit logs for failed authorization checks.
- Add a key rotation plan with `MESSAGE_ENCRYPTION_KEY_CURRENT` and `MESSAGE_ENCRYPTION_KEY_PREVIOUS`.
- Add a one-time encrypted-message backfill job for existing plaintext messages.
- Add a data retention policy, for example auto-delete or anonymize guest conversations after 90 days.
- Add a privacy notice for guests explaining what venue support data is collected.
- Add dependency scanning in CI with `npm audit` or a hosted scanner.
- Add SAST/secret scanning in CI before deployment.
