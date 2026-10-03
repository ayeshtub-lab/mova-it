# Database backups

Two layers:

1. **Neon history (point-in-time restore).** Neon console → project → Settings →
   History retention. Covers recent mistakes (wrong migration, bad script) down to
   the second, within the retention window.
2. **Nightly copy on GitHub** (`.github/workflows/db-backup.yml`). Runs 01:15 UTC,
   restores each dump into a throwaway Postgres to prove it works, encrypts it and
   keeps it 30 days as a workflow artifact. Covers losing Neon itself.

A failed run emails the repo owner. Run it by hand from GitHub → Actions →
"DB backup" → Run workflow.

## Restoring a nightly copy

1. GitHub → Actions → "DB backup" → pick a run → download the artifact
   (a zip holding `zawmo-db-YYYY-MM-DD.dump.enc`).
2. Decrypt (needs `BACKUP_PASSPHRASE`, kept in `.env.backup` and your password manager):

   ```bash
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
     -in zawmo-db-YYYY-MM-DD.dump.enc -out zawmo.dump -pass pass:'<passphrase>'
   ```

3. Restore into a **new, empty** Neon branch or database first — never straight
   over production — and check it:

   ```bash
   pg_restore --no-owner --no-privileges -d "<empty database url>" zawmo.dump
   ```

4. Only then point the app at it (Vercel `DATABASE_URL`) or copy the needed rows back.

The pg_restore client must be Postgres 18 or newer.
The target database must have the **pgvector** extension available (Neon has it; on your own
Postgres install `postgresql-18-pgvector`, or use the `pgvector/pgvector:pg18` image) — the
`AngleVector` table («📸 لقطات بتشبهها») uses it.
