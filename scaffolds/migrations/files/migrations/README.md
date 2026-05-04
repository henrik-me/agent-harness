# migrations/

This directory holds versioned database migration files managed by
`scripts/run-migration.mjs` and validated by `scripts/check-migration-policy.mjs`.

## Naming convention

Every migration consists of a **pair** of files with the same prefix:

```
NNNN_<slug>.up.sql    forward migration  (applied in ascending NNNN order)
NNNN_<slug>.down.sql  reverse migration  (applied in descending NNNN order to roll back)
```

| Segment | Rules |
|---|---|
| `NNNN` | Zero-padded 4-digit sequence number, starting at `0001`. No gaps are required but duplicates are forbidden. |
| `<slug>` | Lowercase letters, digits, and hyphens (`[a-z0-9-]+`). Describes what the migration does (e.g. `create-users-table`, `add-email-index`). |
| extension | Exactly `.up.sql` or `.down.sql`. |

Valid examples:
```
0001_create-users-table.up.sql
0001_create-users-table.down.sql
0002_add-email-index.up.sql
0002_add-email-index.down.sql
```

## Workflow

1. Create both `NNNN_<slug>.up.sql` and `NNNN_<slug>.down.sql` together.
2. Run `node scripts/check-migration-policy.mjs` to validate naming and pairing before commit.
3. Run `node scripts/run-migration.mjs` to preview the migration plan.
4. Implement your DB adapter in `scripts/run-migration.mjs` to execute for real.

## Notes

- Never rename or delete a migration that has already been applied to a shared environment.
- The `0001_example.*` files are placeholder starters — customize or delete them.
