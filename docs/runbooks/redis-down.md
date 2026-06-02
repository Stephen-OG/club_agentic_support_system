# Runbook: Redis Down

## Symptoms

- API startup fails in production with a `REDIS_URL` or Redis connection error.
- Rate limits behave inconsistently across instances.
- Public QR intake cache misses increase.
- Background jobs stop processing or repeatedly retry.

## Immediate Response

1. Check the Redis provider status page and instance metrics.
2. Confirm `REDIS_URL` is present in the API secret manager.
3. Confirm the API can reach Redis from the deployment network.
4. If Redis is degraded, reduce API instance count to one only as a short emergency fallback for non-critical environments.
5. Do not remove `REDIS_URL` in production; the API should fail fast rather than run multi-instance state in memory.

## Recovery

1. Restore Redis service or rotate to a healthy Redis endpoint.
2. Restart API instances after the secret or endpoint is corrected.
3. Verify `GET /health`.
4. Create a guest QR request and confirm staff queue updates.
5. Watch logs for rate-limit storage or BullMQ connection errors for 15 minutes.

## Follow-Up

- Record outage start/end time.
- Review whether Redis memory, connection limits, or network allow-lists caused the incident.
- Add provider alert thresholds for connection failures, memory pressure, and CPU saturation.
