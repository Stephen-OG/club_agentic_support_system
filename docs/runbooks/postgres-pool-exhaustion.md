# Runbook: Postgres Pool Exhaustion

## Symptoms

- API logs show `PrismaClientUnknownRequestError`.
- Error text includes `EMAXCONNSESSION`, `max clients reached in session mode`, or `pool_size`.
- Public QR conversation reads or admin venue/request endpoints intermittently return 500.

## Immediate Response

1. Reduce API instance count to one while you recover.
2. Check Supabase/Postgres active connections and pool size.
3. Confirm the API is not running duplicate services, workers, or deploy previews against the same small database pool.
4. Add Prisma pool limits to `DATABASE_URL`, for example:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/postgres?connection_limit=3&pool_timeout=30"
```

5. Restart the API after updating the secret.

## Recovery Checks

1. Open `/admin` and confirm `GET /admin/venues` returns 200.
2. Open `/staff` or Operations and confirm `GET /venues/:venueId/requests` returns 200.
3. Open one guest QR conversation and confirm polling no longer returns 500.
4. Watch logs for 15 minutes for new `EMAXCONNSESSION` errors.

## Follow-Up

- Keep `API instances * connection_limit` below the provider pool size.
- Scale Supabase pool size only after the app is stable with explicit Prisma limits.
- Add connection-count alerts in Supabase.
- Avoid running migrations or seed scripts from every API instance.
