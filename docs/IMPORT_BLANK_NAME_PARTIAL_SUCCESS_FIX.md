# Import fails entirely when a member has a blank surname — partial-success fix

## Symptom

PAA / Survey Solutions ETL imports fail with the whole district rolled back
(`PulledHistory.status = 'failed'`, `number_of_households = 0`). The recorded
error is always:

```
Individual import workflow failed: {'error': 'null value in column "last_name"
of relation "individual_individual" violates not-null constraint', ...}
```

Smaller districts import fine; larger ones fail — but the real driver is **not
size**. A 3,471-household import succeeded while others failed. The pattern is
data-specific: any district that contains **even one member with a blank
surname** fails completely.

## Root cause (two layers)

### 1. A single-name member produces a NULL surname

Survey Solutions records the full name in one field (`hh_members_name`), which
the adapter splits into first/last
(`openimis-be-api_etl_py/api_etl/adapters/survey_solutions_targeting_adapter.py`):

```python
if len(parts) == 1:
    first_val, last_val = parts[0], ""      # single name -> empty surname
...
last_val = self._title_case(last_val) if last_val else None   # "" -> None
```

So a member entered with **one name** ("Jeff") ends up with `last_name = None`.
The non-consented household *stub* (`survey_solution_service.py`) has the same
shape (`hh_members_name = head_name`).

### 2. The import validation only checks key *presence*, not value

`individual_upload_valid.py` validated required fields with the jsonb
key-presence operator:

```sql
AND NOT ds."Json_ext" ? 'last_name';   -- catches a MISSING key only
```

The ETL CSV **always** includes a `last_name` column, so the key is present
even when the value is `null`/`''`. The blank-surname row therefore passed
validation, reached the `INSERT INTO individual_individual`, and tripped the
`last_name` NOT NULL constraint. The procedure's `EXCEPTION WHEN OTHERS`
handler turned that into `status = 'FAIL'` for the **entire upload**, and the
sink (`individual_import_sink.py`) raised on `status = FAIL`, rolling back the
whole batch.

### Why "the same export worked before"

It wasn't the same data. The config pulls
`export_interview_status = "ApprovedBySupervisor"`, so each run grabs whatever
is approved at that moment. As more interviews are approved, a newly-approved
member recorded with a single name enters the batch and aborts the district.
The name-splitting logic itself was unchanged by recent commits — this is data
drift, not a code regression, and **not** the `sink_csv_fields` config change
(`last_name` is present there and other imports succeed under the same config).

## Maker-checker context

The `individual` module has maker-checker for imports
(`enable_maker_checker_for_individual_upload = True`); the normal UI upload
creates a `tasks_management` approval task via
`create_task_with_importing_valid_items`. The **ETL path bypasses it**:
`sink_trigger_workflow_after_upload = true` + `sink_workflow =
"Python Valid Upload Individuals"` runs the import procedure directly, so no
approval task is created. Either way, a blank surname used to crash the run
rather than being isolated.

## The fix — partial success, no fabricated data

Implemented in `individual/workflows/individual_upload_valid.py` (both
`upload_sql` and `upload_sql_partial`):

1. Detect a missing required value (`first_name` / `last_name` / `dob`) using
   value-emptiness (`NULLIF(btrim("Json_ext"->>'last_name'), '') IS NULL`)
   instead of key-presence.
2. **Flag** those rows by writing a `validation_errors` entry into their
   `validations` column — instead of failing the whole upload.
3. The existing `INSERT` already excludes rows whose
   `validation_errors <> '[]'`, so flagged rows are skipped and **the rest of
   the batch imports**. The upload is marked `PARTIAL_SUCCESS` (or `FAIL` only
   when *zero* rows are importable).

No surnames are fabricated. Bad rows are isolated in staging for review and
correction at source.

## How to review the held-back rows

Flagged rows stay in `individual_individualdatasource` with `individual_id IS
NULL` and a populated `validation_errors`:

```sql
SELECT ds."Json_ext"->>'first_name'    AS first_name,
       ds."Json_ext"->>'last_name'     AS last_name,
       ds."Json_ext"->>'group_code'    AS household,
       ds."Json_ext"->>'interview_key' AS interview,
       ds.validations->>'validation_errors' AS why_invalid
FROM individual_individualdatasource ds
JOIN individual_individualdatasourceupload up ON up."UUID" = ds.upload_id
WHERE up.status = 'PARTIAL_SUCCESS'
  AND ds.individual_id IS NULL
  AND COALESCE(ds.validations->>'validation_errors','[]') <> '[]'
ORDER BY ds.upload_id;
```

They are also visible in the openIMIS Upload History view, and the upload's
`error.failing_entries` lists their UUIDs.

## How to correct

openIMIS surfaces *which* rows are invalid and *why*, but is not a cell editor.
Correct the names at **source (Survey Solutions)** using the interview keys,
then re-run the ETL import. The import is idempotent (dedups/updates by
`external_id`), so corrected members update in place and the rest are untouched.

## Deployment

`upload_sql` / `upload_sql_partial` are anonymous `DO $$` blocks executed at
runtime (not persisted DB functions), so **no migration is needed** — rebuild
and redeploy the backend + worker images, then re-run the failed districts.

## Configurable maker-checker for ETL imports

The ETL path can now route imports through the openIMIS maker-checker (approval)
flow instead of importing immediately. It is controlled by a single api_etl
config flag:

```json
"sink_enable_maker_checker": false   // default: import runs straight through
```

When set to `true`:

- The sink **stages** the upload (creates the `IndividualDataSourceUpload`,
  `IndividualDataSource` rows and `IndividualDataUploadRecords`) but does **not**
  run the import workflow. The upload is left in `WAITING_FOR_VERIFICATION`.
- A `tasks_management` approval **task** is created
  (`IndividualTaskCreatorService.create_task_with_importing_valid_items` for new
  records, `create_task_with_update_valid_items` for updates).
- A checker reviews and approves the task in the **Tasks** UI. On approval the
  configured `validation_import_valid_items_workflow` runs the same
  `upload_sql_partial` procedure — so the partial-success / blank-name isolation
  above applies to the approved batch too.

When `false` (default) the sink imports immediately, exactly as before.

Implementation: `openimis-be-api_etl_py/api_etl/sinks/individual_import_sink.py`
(`_stage_and_create_task`, branched in `push()`), flag declared in
`openimis-be-api_etl_py/api_etl/apps.py` `DEFAULT_CONFIG`.

**Note:** like all api_etl config, the live value comes from the
`core_ModuleConfiguration` row for `name="api_etl"` (DB row beats
`DEFAULT_CONFIG`). To enable on a running server, update that row and restart
backend + worker.

## Scope / follow-ups

- Fix is in the `individual` import workflow, so it applies to every import
  source (ETL and UI upload).
- A malformed (non-empty) `dob` can still raise in `to_date(...)`; only
  empty/whitespace values are isolated here. The ETL adapter normalises dob, so
  this is low risk.
- ETL maker-checker is implemented and configurable via
  `sink_enable_maker_checker` (see section above).
- Unrelated: the OpenSearch `group.pssn_wave` mapping error is a separate,
  non-fatal indexing issue — see `docs/OPENSEARCH_PSSN_WAVE_MAPPING_FIX.md`.
