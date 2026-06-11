# Runbook: DB Migration Rollback

## Symptoms

- Deployment fails during Prisma migration.
- API starts but errors on queries involving newly changed tables or columns.
- Data appears partially migrated.

## Immediate Response

1. Stop the deployment and keep the previous API image serving traffic if possible.
2. Do not run additional migrations until the failed migration state is understood.
3. Capture the migration name, database error, and deployment commit SHA.
4. Check Postgres backups and point-in-time recovery availability with the database provider.

## Recovery Options

Use the least destructive option that restores service:

- If the migration did not apply, fix the migration and redeploy.
- If the migration partially applied but no production traffic used it, repair the schema manually or restore from backup.
- If production traffic wrote data after the migration, create a forward-fix migration instead of rolling back blindly.

## Prisma Commands

Inspect migration status:

```bash
npx prisma migrate status --schema packages/database/prisma/schema.prisma
```

Generate Prisma client after schema recovery:

```bash
npm run prisma:generate -w @madupe/database
```

## Follow-Up

- Add a staging migration rehearsal before production.
- Keep a database backup timestamp next to every production deploy.
- Document whether rollback used restore, schema repair, or forward fix.
