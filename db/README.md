# Ops Hub — local database

Postgres 16 in Docker, for local dev only.

```bash
cd db
docker compose up -d
docker compose ps        # wait for "healthy"
```

`schema.sql` is applied automatically **only when the `opshub_pgdata` volume
is first created**. It is a reference/bootstrap file, not a live migration
source.

## After the first run

Once `api/` exists and `prisma db pull` has generated `schema.prisma` from
this database, **all further schema changes go through Prisma migrations**
committed to git. Do not hand-edit `schema.sql` expecting it to change the
running database — it only affects a fresh volume and will silently drift
from reality otherwise.

## Connecting

```
postgresql://opshub:opshub_dev@localhost:5432/opshub
```

## Resetting to a clean schema (destroys local data)

```bash
docker compose down -v
docker compose up -d
```

Never run this against anything but the local dev database.
