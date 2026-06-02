# Runbook: OpenAI Failure

## Symptoms

- Guest messages are accepted but AI triage logs show model errors.
- Requests have fallback summaries or lower-confidence categories.
- Urgent/safety terms still need deterministic escalation.

## Immediate Response

1. Check OpenAI service status and API key validity.
2. Confirm `OPENAI_API_KEY` and `OPENAI_TRIAGE_MODEL` are set for the API.
3. Keep guest intake open if deterministic fallback triage is working.
4. If fallback triage is not working, temporarily instruct venues to watch new requests more closely and disable any risky automation.

## Recovery

1. Restore the OpenAI key or wait for provider recovery.
2. Send a non-sensitive test guest message in a staging venue.
3. Confirm triage category, priority, staff summary, and safety detection are populated.
4. Review failed triage logs and decide whether any requests need manual reclassification.

## Follow-Up

- Track error rate and latency for triage calls.
- Add an alert when AI triage failures exceed the agreed threshold.
- Keep deterministic safety escalation tests passing before every deploy.
