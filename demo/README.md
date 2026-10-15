# TASAF MIS — local setup with demo data

Run the full TASAF MIS on your own machine, starting from nothing: an empty database, then the
TASAF set-up (Tanzania locations, menus, roles, test users), then a demo dataset of about 1,000
invented households that go through registration, import, enrolment, payments, grievances, case
management and events. No real beneficiary data is used.

What the demo contains and how it is generated: [DEMO_DATA.md](DEMO_DATA.md).

## 1. Requirements

- Linux or macOS (on Windows use WSL2), **16 GB RAM**, **40 GB free disk**.
- Docker Engine 24+ with the Compose plugin (`docker compose version` prints a version).
- `git`.
- These host ports free: **80**, **443** (web), **5434** (PostgreSQL), **6379** (Redis),
  **5673**, **15673** (RabbitMQ), **9200**, **5410** (OpenSearch). Stop any other openIMIS stack
  on the same machine first.

All repositories are public; no GitHub account is needed.

## 2. Get the code

```bash
git clone https://github.com/TASCB/openimis-dist_dkr.git
cd openimis-dist_dkr
git clone -b tz-changes https://github.com/TASCB/openimis-be_py.git
git clone -b tz-changes https://github.com/TASCB/openimis-fe_js.git
cp openimis-be_py/openimis.server.json openimis-be_py/openimis.json
cp openimis-fe_js/openimis.server.json openimis-fe_js/openimis.json
```

`openimis.json` lists the modules and branches the build installs; the copies above give you the
same set the TASAF servers use.

## 3. Configure

```bash
cp .env.example .env
cp .env.cache.example .env.cache
cp .env.openSearch.example .env.openSearch
```

In `.env`, set at least:

| Variable | Value |
|---|---|
| `DB_DEFAULT` | `postgresql` |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | `IMIS` / `IMISuser` / a password of your choice |
| `ESB_ENABLED` | `false` |

Leave `DEMO_DATASET` commented out (that is openIMIS's own health demo, not this one). Put quotes
around any value that contains a space.

## 4. Build and start

```bash
docker compose build backend frontend          # first build: 20–40 minutes
docker compose up -d                           # creates the database, applies the migrations, starts everything
docker compose logs -f migrations              # wait until it exits, then Ctrl-C
```

The application is at `http://localhost/front/`. At this point it is plain openIMIS: no TASAF
menus, roles or locations yet.

If the build stops on the first `FROM` line or while downloading an image (`i/o timeout`,
`network is unreachable`), it is your machine's DNS or IPv6, not the code. Pull the base images by
hand and build again:

```bash
docker pull python:3.11-bookworm && docker pull node:20 && docker pull nginx:latest
```

## 5. Set up TASAF

```bash
docker compose exec -T -e SEED_PASSWORD='Choose-A-Password-1' backend python manage.py shell < scripts/demo/bootstrap_fresh.py
```

About 15 seconds. It adds:

- the TASAF roles and rights;
- all Tanzania regions, districts, wards and villages (31 / 198 / 4,410 / 21,037);
- the TASAF menus and the region/district picker settings;
- one test user per TASAF role (`tz_…`), and sets the `Admin` password, all to `SEED_PASSWORD`
  (default `TasafDemo@2026` if you leave it out);
- the task group that lets imports and enrolments be approved, the PCT programme, and the list of
  media houses.

openIMIS's own sample users are locked and its sample places retired. Running it again only adds
what is missing.

## 6. Load the demo data

```bash
docker compose exec -T backend python manage.py shell < scripts/demo/seed_full_demo.py
```

About 5 minutes. Options and what it creates: [DEMO_DATA.md](DEMO_DATA.md).

## 7. After loading — always

```bash
# Empty the cache: rights and menus are cached and do not match the new data
docker compose exec redis sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning FLUSHALL'

# Build the search indexes from the database
docker compose exec backend python manage.py opensearch index rebuild --force
docker compose exec backend python manage.py opensearch document index --force
```

If `redis-cli` answers `NOAUTH`, use the password from `.env.cache` in place of `$REDIS_PASSWORD`.
Log out and back in after this.

## 8. Log in

Every account uses the `SEED_PASSWORD` from §5.

| Login | Use it for |
|---|---|
| `Admin` | everything |
| `tz_import_officer` | imports |
| `tz_task_triage` | approving imports and enrolments in Tasks |
| `tz_maker` | preparing payments; `tz_approver` and `tz_approver2` approve them |
| `tz_paaf` | field case management (Arusha and Monduli); `tz_tmo` approves the changes |
| `tz_grm_intake`, `tz_grievance` | grievances |
| `tz_comms_officer`, `tz_comms_manager` | communications |
| `tz_coord_officer`, `tz_coord_manager` | coordination |
| `tz_pct_officer`, `tz_pct_manager` | trainings |

The other `tz_…` users cover the remaining roles (auditor, finance, M&E, director of programs,
council coordinator, access requests, system administrator). Most test users work in Arusha;
`tz_paaf` and `tz_tmo` also cover Monduli. About half the demo households live in these two
districts; `Admin` sees them all.

## 9. Check it works

| Screen | Expect |
|---|---|
| Registry ▸ Households, search `P3-` | ~970 households; open one to see members, roles and ages |
| Registry ▸ Import history | one `DEMO …` upload per district (one of them a partial success), and `DEMO late returns` waiting for approval |
| Programmes | PCT, Public Works and Economic Inclusion with beneficiaries |
| Tasaf Payments ▸ Paylists | 13 paylists in every status |
| Grievance ▸ Tickets | 160 tickets |
| Communications ▸ Activities ▸ events | 3 events with attendance |
| Case management ▸ Pending updates | changes waiting for approval |
| Tasks | an import approval and a PCT enrolment waiting |

**Start over:** remove the demo and load it again (the set-up of §5 stays):

```bash
docker compose exec -T -e SEED_UNDO=1 backend python manage.py shell < scripts/demo/seed_full_demo.py
docker compose exec -T backend python manage.py shell < scripts/demo/seed_full_demo.py
```

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| Build stops at `FROM` or while downloading a layer | DNS / IPv6 on your machine — pull the base images by hand (§4) and build again |
| `port is already allocated` | Another program uses one of the ports in §1 — stop it, or change the host port in `.env` |
| Menus or pages missing after login | Empty the cache (§7), then log out and back in |
| Only openIMIS menus, no TASAF ones | §5 has not run, or ran before the migrations finished — run it again |
| `No villages in this database` from the demo | Run §5 first |
| `Already seeded` from the demo | Remove it first (`SEED_UNDO=1`, §9) |
| Search or dashboards show people who are not in the registry | Rebuild the search indexes (§7) |
