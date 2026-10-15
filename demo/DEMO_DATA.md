# TASAF MIS demo data

One connected demo dataset for the whole system, built by
[`scripts/demo/seed_full_demo.py`](../scripts/demo/seed_full_demo.py) on top of the TASAF set-up
from [`scripts/demo/bootstrap_fresh.py`](../scripts/demo/bootstrap_fresh.py). Setting up a local
instance and loading it: [README.md](README.md).

## What it contains

| Area | Contents |
|---|---|
| Registry | ~970 households and ~4,200 people, imported through the real import pipeline; about half in Arusha and Monduli, the rest across five other districts |
| Imports | One upload per district (successes, and one **partial success**: 2 member rows with a blank surname held back), plus one upload of 30 households **waiting for import approval** |
| Programmes | **PCT** (~670 households), **Public Works** (~150), **Economic Inclusion** (~95). Some households are in two programmes; about 5% of PCT graduated to Economic Inclusion and 4% are suspended. Non-poor and non-consented households are registered but never enrolled. One **PCT enrolment task** waits in Tasks |
| Payments | One payment account per household, in every verification state (some with an invalid mobile number); 3 payment plans, 6 cycles, 9 payrolls, ~3,500 benefits; **13 paylists in every status** for PCT, Public Works and Economic Inclusion, with MUSE message logs, returns and one two-step approval request |
| Grievances | 160 tickets from demo household heads, across statuses |
| Case management | History on 40 households, and every kind of pending update: payment, phone, representative, member and household changes, from the web and the mobile app, waiting, approved, rejected and superseded |
| Communications | 3 community events with an attendance register linked to the beneficiaries; activities with media coverage |
| Other modules | Trainings, coordination activities and notifications |

Amounts follow the programme rules: PCT from the real PCT calculation and each household's member
ages; Public Works wages are days worked (8–20) × 3,000 TZS; the Economic Inclusion grant is
50,000 TZS.

## How the households are made

Every household is invented and placed in a real Tanzanian village:

- **People:** a head (aged 24–82), usually a spouse, children, grandchildren in older heads'
  households, sometimes a parent or another relative; 1 to 9 members. Fictional Tanzanian names,
  dates of birth that match the ages.
- **Representative:** the head, or sometimes the spouse.
- **Survey answers:** the same questions a real registration survey carries (housing, assets,
  schooling, disability, disasters …), with answers drawn from how often each answer occurs in
  real surveys. Only answer codes are used: no names, phone or ID numbers, GPS or free text.
- **Poverty score:** 78% of households are scored poor and can be enrolled, the rest not poor.
- **Consent:** about 3% of households are registered without consent (one stub row, never
  enrolled).

The households then go through the real import, one upload per district, exactly as a survey
upload does.

Everything the script creates is tagged `json_ext._seed = 'full_demo'`; the module demo commands
use their own tags.

## Building it

Run [`bootstrap_fresh.py`](../scripts/demo/bootstrap_fresh.py) first ([README.md](README.md) §5),
then, from the `openimis-dist_dkr` folder:

```bash
# seed (about 5 minutes for 1,000 households)
docker compose exec -T backend python manage.py shell < scripts/demo/seed_full_demo.py

# another size
docker compose exec -T -e SEED_HOUSEHOLDS=300 backend python manage.py shell < scripts/demo/seed_full_demo.py

# without the other modules' demo data (pending updates, communications, coordination, training, notifications)
docker compose exec -T -e SEED_SKIP_MODULES=1 backend python manage.py shell < scripts/demo/seed_full_demo.py

# remove the demo
docker compose exec -T -e SEED_UNDO=1 backend python manage.py shell < scripts/demo/seed_full_demo.py
```

| Variable | Default | Meaning |
|---|---|---|
| `SEED_HOUSEHOLDS` | 1000 | Households to create and import |
| `SEED_RNG` | 20260929 | Random seed: the same value gives the same households, names and answers |
| `SEED_SKIP_MODULES` | — | `1` skips the other modules' demo data |
| `SEED_UNDO` | — | `1` removes the demo instead of creating it |
| `SEED_SOURCE` | automatic | `fresh` invents the households; `real` copies and anonymises households already imported into this database. Left out, the script uses `real` when the database has imported households and `fresh` otherwise |

- The script refuses to run twice; remove the demo first.
- The import runs one upload at a time, like a real import. The rest runs in one transaction. If it
  fails after the import, the script says so: run it with `SEED_UNDO=1` to remove the imported
  households.
- The pending-updates demo is made by `Admin` and approved by `tz_tmo`, on households in `tz_tmo`'s
  districts (Arusha and Monduli). A small run such as `SEED_HOUSEHOLDS=50` may leave too few
  households there; it is then skipped with a message and everything else is created.
- Afterwards: empty the cache, rebuild the search indexes and log in again ([README.md](README.md) §7).

## Removing it

`SEED_UNDO=1` removes the other modules' demo data, the approval requests, tasks and notifications of
the demo paylists, MUSE logs, the demo imports with their tasks and staging rows, events and
attendance, enrolments, and finally every `full_demo` record from tickets back to the households.
Programmes, payment plans and FSP mappings are removed only if the script created them. The TASAF
set-up from `bootstrap_fresh.py` (locations, menus, roles, users) stays. As with any deletion in
openIMIS, the audit-history tables keep a record of the removed rows.

The undo refuses, and deletes nothing, if data that is not part of the demo points at demo records
(for example a payroll created by hand on a demo payment cycle). Remove that data first.

## Things to know

- Paylists are written directly in their final status; only the Economic Inclusion paylist waiting
  for approval has an approval request.
- Training participants and coordination activities use their own invented data and are not linked
  to the demo households.

## Quick check after building

| Screen | Expect |
|---|---|
| Registry ▸ Import history | one `DEMO …` upload per district (one of them a partial success), and `DEMO late returns` waiting for approval |
| Tasks | one PCT enrolment task and one import approval waiting |
| Registry ▸ Households, search `P3-` | the demo households; open one: members, roles, ages, registration answers |
| Programmes ▸ PCT / Public Works / Economic Inclusion | beneficiaries; graduated and suspended households in PCT |
| Eligible / Non-consented households | non-poor and non-consented demo households, not enrolled |
| Tasaf Payments ▸ Paylists | 13 paylists, every status |
| Case management ▸ Pending updates | every kind of pending update |
| Communications ▸ Activities ▸ events | 3 events with beneficiary attendance |
| Grievance ▸ Tickets | 160 tickets across statuses |
