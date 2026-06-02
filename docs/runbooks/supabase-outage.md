# Runbook: Supabase Outage

## Symptoms

- Login fails or users are redirected to `/login`.
- `/me` returns authentication or profile lookup errors.
- API database calls fail with connection timeouts.
- Guest chat cannot create conversations or support requests.

## Immediate Response

1. Check Supabase project status and regional status.
2. Confirm whether the failure is Auth, Postgres, or both.
3. Pause public launch traffic or announce degraded service if guest request creation is affected.
4. Do not disable auth guards or bypass membership checks.

## Recovery

1. Wait for Supabase recovery or fail over according to your Supabase backup plan.
2. Restart API instances only after database connectivity is restored.
3. Verify login with a verified owner account.
4. Verify `/me`, `/admin`, `/staff`, and one public QR request.
5. Check for failed requests during the incident window and follow up with affected venues.

## Follow-Up

- Export incident logs for the outage window.
- Confirm automated Postgres backups are enabled.
- Review whether the app needs a read-only maintenance page for future auth/database incidents.
