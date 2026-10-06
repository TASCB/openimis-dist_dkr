"""Full-system demo data built from 1,000 real, anonymised households.

Takes real households from earlier imports (the staged rows of IndividualDataSource), replaces
every name, phone, ID number, GPS point and survey key, and pushes them through the real import
pipeline (IndividualImportSink -> staging -> SQL import -> group linking -> PCT enrolment task),
one upload per district. Then enrols them in PCT, Public Works and Economic Inclusion and runs
them through the whole system: payment accounts, plans, cycles, payrolls, bills, BANK/MNO
paylists in every current status (with MUSE message logs and approval requests), grievances,
case management, pending updates, community events with a beneficiary attendance register, and
the communications, coordination, training and notification demo seeders.

Scenarios built in: an import awaiting maker-checker approval, an import with held-back rows
(PARTIAL_SUCCESS), a PCT enrolment task waiting for approval, NON_POOR and non-consented
households (registered, never enrolled), households in two programmes, PCT graduates moved to
Economic Inclusion, suspended beneficiaries.

Every row this script creates or imports is tagged json_ext._seed = 'full_demo' (MUSE log rows,
which have no json_ext, are found through their paylist; staging rows through their upload).
The module seeders it calls keep their own tags and are undone with their own flags. Real
records are only read, never modified.

Run inside the backend container (no rebuild):

    docker compose exec -T backend python manage.py shell < seed_full_demo.py
    docker compose exec -T -e SEED_HOUSEHOLDS=300 backend python manage.py shell < seed_full_demo.py
    docker compose exec -T -e SEED_UNDO=1 backend python manage.py shell < seed_full_demo.py

Guide: docs/FULL_DEMO_SEED.md
"""
import json
import re
import os
import random
import string
import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.apps import apps
from django.contrib.contenttypes.models import ContentType
from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.utils import timezone

TAG = 'full_demo'
HOUSEHOLDS = int(os.environ.get('SEED_HOUSEHOLDS', '1000'))
UNDO = os.environ.get('SEED_UNDO') == '1'
SKIP_MODULES = os.environ.get('SEED_SKIP_MODULES') == '1'
RNG = random.Random(int(os.environ.get('SEED_RNG', '20260929')))
CASE_HOUSEHOLDS = 40
TICKETS = 160
SOURCE = 'DEMO'                  # upload names start with this
POOR_SHARE = 0.78                # the rest are NON_POOR: registered, never enrolled
AWAITING_IMPORT = 30             # households staged behind import maker-checker, not imported
BLANK_SURNAMES = 2               # member rows held back by validation (PARTIAL_SUCCESS)
PWP_SHARE = 0.30                 # active PCT households with a working-age member also in Public Works
EI_SHARE = 0.10                  # active PCT households also in Economic Inclusion
GRADUATED_SHARE = 0.05           # PCT households graduated and moved to Economic Inclusion
SUSPENDED_SHARE = 0.04
HHID_RE = r'^P3-\d{9}-\d{8}$'
PII_KEY = re.compile(r'name|phone|nin|id_no|geo|gps|photo|interview__id|interview_key|assignment|'
                     r'existing_hhid|suggestion|sssys|hhid', re.IGNORECASE)
CSV_FIELDS = ['first_name', 'last_name', 'dob', 'gender', 'group_code', 'hhrep', 'individual_role',
              'individual_role_code', 'member_ordinal', 'interview_key', 'external_id',
              'location_code', 'location_name', 'pmt_score', 'pmt_class', 'consent_res',
              'pssn_wave', 'record_type', 'json_ext']

FIRST_M = ['Juma', 'Hamisi', 'Baraka', 'Emmanuel', 'Said', 'Rashid', 'Mussa', 'Daudi', 'Elias',
           'Frank', 'Godfrey', 'Ibrahim', 'Nassoro', 'Shabani', 'Yusuph', 'Athumani', 'Salum',
           'Joseph', 'Petro', 'Omari', 'Hassani', 'Ramadhani', 'Kassimu', 'Mohamedi', 'Paulo',
           'Selemani', 'Abdallah', 'Issa', 'Musa', 'Zakaria']
FIRST_F = ['Asha', 'Neema', 'Zainabu', 'Halima', 'Rehema', 'Mwajuma', 'Amina', 'Subira', 'Tatu',
           'Fatuma', 'Grace', 'Upendo', 'Salma', 'Riziki', 'Zuhura', 'Mwanaidi', 'Saida', 'Mariamu',
           'Esther', 'Joyce', 'Agnes', 'Hadija', 'Mwanahawa', 'Sikudhani', 'Pili', 'Mwanahamisi',
           'Rukia', 'Happiness', 'Rose', 'Veronica']
SURNAMES = ['Mwakasege', 'Kimaro', 'Mtenga', 'Shirima', 'Msangi', 'Ngowi', 'Kessy', 'Mwakalinga',
            'Lyimo', 'Massawe', 'Mrema', 'Chuwa', 'Mbwambo', 'Nkya', 'Swai', 'Mollel', 'Laizer',
            'Kombo', 'Mfinanga', 'Mushi', 'Kiwelu', 'Temba', 'Sanga', 'Mbilinyi', 'Kalinga',
            'Mahenge', 'Kisanga', 'Mwamba', 'Nyamoga', 'Bakari', 'Rajabu', 'Mohamedi', 'Hussein',
            'Mapunda', 'Komba', 'Ndunguru', 'Haule', 'Mbele', 'Chande', 'Salehe']

# (relationship code, role, share of members after the head); sex decided per member.
RELATIONS = [('2', 30), ('3', 40), ('5', 12), ('6', 4), ('8', 4), ('4', 3), ('10', 3), ('13', 2),
             ('9', 2)]
ROLE = {
    ('1', 'M'): 'HEAD', ('1', 'F'): 'HEAD', ('2', 'M'): 'SPOUSE', ('2', 'F'): 'SPOUSE',
    ('3', 'M'): 'SON', ('3', 'F'): 'DAUGHTER', ('4', 'M'): 'SON IN LAW', ('4', 'F'): 'DAUGHTER IN LAW',
    ('5', 'M'): 'GRANDSON', ('5', 'F'): 'GRANDDAUGHTER', ('6', 'M'): 'FATHER', ('6', 'F'): 'MOTHER',
    ('8', 'M'): 'BROTHER', ('8', 'F'): 'SISTER', ('9', 'M'): 'OTHER RELATIVE', ('9', 'F'): 'OTHER RELATIVE',
    ('10', 'M'): 'STEP CHILD', ('10', 'F'): 'STEP CHILD', ('13', 'M'): 'HOUSE HELP', ('13', 'F'): 'HOUSE HELP',
}
HEAD_AGE = (24, 78)

PCT_RULE = {
    'base_amount': '14000', 'disability_top_up': '5000',
    'young_child_unit': '7000', 'young_child_cap_count': '3',
    'young_child_age_min': '0', 'young_child_age_max': '5',
    'primary_unit': '5000', 'primary_cap_count': '3', 'primary_count_field': 'primary',
    'secondary_unit': '8000', 'secondary_cap_count': '3', 'secondary_count_field': 'secondary',
    'household_cap_amount': '50000', 'invoice_label': 'PCT Transfer',
}
EI_RULE = {'base_amount': '50000', 'primary_unit': '0', 'household_cap_amount': '50000',
           'invoice_label': 'Economic Inclusion Grant'}
EI_AMOUNT = Decimal('50000')
PWP_RULE = {'base_amount': '3000', 'primary_unit': '0', 'household_cap_amount': '60000',
            'invoice_label': 'Public Works Wages'}
PWP_DAILY_RATE = 3000

# (display name, code, BANK/MOBILE, weight, BIC)
FSPS = [
    ('Vodacom M-Pesa', 'MPESA', 'MOBILE', 26, None), ('NMB Bank', 'NMB', 'BANK', 18, 'NMIBTZTZ'),
    ('CRDB Bank', 'CRDB', 'BANK', 16, 'CORUTZTZ'), ('Airtel Money', 'AIRTELMONEY', 'MOBILE', 12, None),
    ('Tigo Pesa', 'TIGOPESA', 'MOBILE', 9, None), ('Halopesa', 'HALOPESA', 'MOBILE', 6, None),
    ('NBC Bank', 'NBC', 'BANK', 4, 'NLCBTZTX'), ('TPB Bank', 'TPB', 'BANK', 3, 'TAPBTZTZ'),
    ('Equity Bank', 'EQUITY', 'BANK', 2, 'EQBLTZTZ'), ('Akiba Bank', 'AKIBA', 'BANK', 1, 'AKCOTZTZ'),
]
VERIFICATION = [(1, 78), (2, 9), (0, 6), (3, 4), (4, 3)]   # VERIFIED FAILED PENDING MANUAL PENDING_MUSE
FAIL_REASONS = ['FSP account name mismatch', 'Account not found at FSP', 'Mobile number not registered',
                'Account closed', 'Account dormant for more than 12 months']
MANUAL_REASONS = ['Partial name match - needs officer review', 'Recipient name spelt differently at FSP',
                  'Joint account - confirm primary holder']
RETURN_REASONS = [('R01', 'Account closed'), ('R02', 'Account name mismatch'), ('R03', 'Account dormant'),
                  ('U01', 'Beneficiary did not collect within the window'), ('U02', 'Mobile wallet not activated')]
INVALID_MOBILE_SHARE = 0.08

TICKET_STATUS = [('RECEIVED', 22), ('OPEN', 25), ('IN_PROGRESS', 23), ('RESOLVED', 18), ('CLOSED', 12)]
TICKET_PRIORITY = [('Critical', 6), ('High', 24), ('Normal', 50), ('Low', 20)]
TICKET_TEXT = [
    'The household head reports that the household did not receive the last payment although the '
    'payment account was verified before the cycle. Neighbours on the same list were paid on the '
    'published date. The head asks the council to confirm whether the household was left off the '
    'paylist and when the missed amount will be paid.',
    'The beneficiary says the amount received this cycle was lower than in previous cycles although '
    'the number of children in school did not change. She was not told about any deduction at the pay '
    'point. She asks for the payment to be checked against the enrolment record and any shortfall to '
    'be paid in the next cycle.',
    'The payment arrived several days after the published date and the pay point had already closed '
    'when the household reached it. The household head walked a long distance twice and lost two days '
    'of work. The household asks that future payment dates are announced earlier by the community '
    'management committee.',
    'The household head passed away last month and the family does not know how to change the '
    'recipient so that payments continue. The eldest daughter now looks after the younger children. '
    'The family asks the facilitator to explain which documents are needed and how long the change of '
    'recipient will take.',
    'The mobile wallet used for payments was blocked by the operator after a SIM card replacement, so '
    'the last transfer could not be withdrawn. The beneficiary visited the operator shop but was told '
    'the programme must confirm the account. She asks for the account to be verified again so the money '
    'can be released.',
    'The household was not included in the targeting list although it meets the criteria and was '
    'visited during the survey. The household head is elderly and cares for three grandchildren without '
    'support. The village council confirmed the situation and asks for the household to be reviewed in '
    'the next targeting update.',
    'The community management committee did not announce the payment date in this village, so many '
    'households missed the payment window. Several beneficiaries only heard about the payment after the '
    'pay point had closed. The village leaders ask that announcements are made at the village meeting '
    'and on the notice board.',
    'A beneficiary reports that a person claiming to work for the programme asked for money in exchange '
    'for keeping the household on the list. The beneficiary did not pay and reported the matter to the '
    'village executive officer. The household asks that the matter is investigated and that the '
    'community is warned about this practice.',
]


def tagged(**extra):
    return {'_seed': TAG, **extra}


def weighted(pairs):
    return RNG.choices([p[0] for p in pairs], weights=[p[1] for p in pairs])[0]


def aware(d, hour=9):
    return timezone.make_aware(datetime.combine(d, time(hour, 0)))


def create(model, user, **fields):
    obj = model(**fields)
    obj.save(user=user)
    return obj


def mute_opensearch():
    try:
        processor = apps.get_app_config('django_opensearch_dsl').signal_processor
    except LookupError:
        return
    if processor:
        processor.teardown()


def seed_user():
    from core.models import User
    return User.objects.filter(username='Admin').first() or User.objects.first()


def bill_code():
    return ''.join(RNG.choices(string.ascii_uppercase + string.digits, k=8))


def msg_id():
    return f'TM{uuid.uuid4().hex[:12].upper()}01'


# ── 1. registry: real households, anonymised, through the real import ────────

LOCATION_KEYS = {'region_name', 'district_name', 'ward_name', 'village_name'}
FEMALE_ROLES = {'DAUGHTER', 'MOTHER', 'SISTER', 'GRANDDAUGHTER', 'DAUGHTER IN LAW', 'WIFE', 'CO-WIFE'}
MALE_ROLES = {'SON', 'FATHER', 'BROTHER', 'GRANDSON', 'SON IN LAW', 'HUSBAND'}


def district_name(village):
    district = village.parent.parent if village and village.parent_id and village.parent.parent_id else None
    return district.name if district else 'Unknown'


def select_source(n):
    """``n`` real imported households, spread evenly across districts, a few non-consented."""
    from django.db import connection
    from individual.models import Group, GroupIndividual, Individual
    from location.models import Location

    g, gi, i = Group._meta, GroupIndividual._meta, Individual._meta
    gj, ij = g.get_field('json_ext').column, i.get_field('json_ext').column
    with connection.cursor() as cur:
        cur.execute(f'''
            SELECT grp.code, grp.location_id, EXISTS (
                SELECT 1 FROM "{gi.db_table}" link JOIN "{i.db_table}" ind ON ind."{i.pk.column}" = link.individual_id
                WHERE link.group_id = grp."{g.pk.column}" AND ind."{ij}"->>'record_type' = 'household_stub')
            FROM "{g.db_table}" grp
            WHERE grp.code ~ %s AND NOT grp."isDeleted" AND NOT (grp."{gj}" ? '_seed')
              AND grp.location_id IS NOT NULL
            ORDER BY grp.code''', [HHID_RE])
        pool = cur.fetchall()
    villages = {v.id: v for v in Location.objects.filter(id__in={loc for _c, loc, _s in pool})
                .select_related('parent__parent')}
    by_district = {}
    for code, location_id, stub in pool:
        by_district.setdefault(district_name(villages.get(location_id)), []).append((code, stub))
    for rows in by_district.values():
        RNG.shuffle(rows)
    picked, stubs, max_stubs = [], 0, max(1, n // 40)
    while len(picked) < n and any(by_district.values()):
        for name in sorted(by_district):
            rows = by_district[name]
            while rows and len(picked) < n:
                code, stub = rows.pop()
                if stub and stubs >= max_stubs:
                    continue
                stubs += stub
                picked.append(code)
                break
    return picked


def load_rows(codes):
    """Every member of each household, as the import row it came from (Individual.json_ext)."""
    from individual.models import GroupIndividual

    households, district = {}, {}
    for chunk in range(0, len(codes), 500):
        links = (GroupIndividual.objects.filter(group__code__in=codes[chunk:chunk + 500], is_deleted=False,
                                                individual__is_deleted=False)
                 .select_related('group__location__parent__parent')
                 .values_list('group__code', 'individual__json_ext', 'group__location_id'))
        for code, row, _loc in links.iterator(chunk_size=2000):
            households.setdefault(code, []).append({**(row or {}), 'group_code': code})
    return households


def sex_of(row):
    raw = (row.get('json_ext') or {}).get('raw') or {}
    value = str(row.get('gender') or raw.get('sex') or '').strip().upper()
    if value in ('M', '1', 'MALE'):
        return 'M'
    if value in ('F', '2', 'FEMALE'):
        return 'F'
    role = str(row.get('individual_role') or '').upper()
    return 'F' if role in FEMALE_ROLES else 'M' if role in MALE_ROLES else RNG.choice('MF')


def scrub_raw(raw, names, member_name, age):
    """The survey answers without anything that identifies a person; names replaced."""
    out = {}
    for key, value in (raw or {}).items():
        roster = re.match(r'hh_mbrs_name__(\d+)$', key)
        if key in LOCATION_KEYS:
            out[key] = value
        elif key.startswith('hhh_name'):
            out[key] = names[0].upper()
        elif key == 'hh_mbrs_name':
            out[key] = member_name.upper()
        elif roster:
            i = int(roster.group(1))
            out[key] = names[i].upper() if i < len(names) and value != '##N/A##' else value
        elif not PII_KEY.search(key):
            out[key] = value
    if 'age' in out and age is not None:
        out['age'] = str(age)
    return out


def jitter_dob(value, today):
    try:
        dob = date.fromisoformat(str(value)[:10])
    except ValueError:
        return value, None
    if dob.year <= 1900:
        return value, None
    dob = min(today, dob + timedelta(days=RNG.randint(-90, 90)))
    return dob.isoformat(), (today - dob).days // 365


def anonymise(rows, used_codes, today, poor):
    """New household code, names, dates of birth and survey keys; structure, village, ages (±3
    months) and survey answers kept. PMT is assigned: ``poor`` decides the class."""
    rows = sorted(rows, key=lambda r: (str(r.get('individual_role_code')) != '1',
                                       str(r.get('member_ordinal') or ''), str(r.get('external_id'))))
    village_code = str(rows[0].get('location_code') or '').zfill(9)
    code = None
    while not code or code in used_codes:
        code = f'P3-{village_code}-{RNG.randint(10**7, 10**8 - 1)}'
    used_codes.add(code)
    interview_key = '-'.join(code[-8:][i:i + 2] for i in range(0, 8, 2))
    surname = RNG.choice(SURNAMES)
    people = []
    for row in rows:
        sex = sex_of(row)
        relation = str(row.get('individual_role_code') or '')
        family = (f'{RNG.choice(FIRST_M)} {surname}' if relation in ('1', '3', '5', '10')
                  else f'{RNG.choice(FIRST_M)} {RNG.choice(SURNAMES)}')
        people.append((sex, RNG.choice(FIRST_F if sex == 'F' else FIRST_M), family))
    names = [f'{given} {family}' for _sex, given, family in people]
    stub = any(r.get('record_type') == 'household_stub' for r in rows)
    score = None if stub else round(RNG.uniform(7.2, 10.9) if poor else RNG.uniform(11.1, 13.4), 3)
    klass = None if stub else ('POOR' if poor else 'NON_POOR')

    ordinals, records = {}, []
    for row, (sex, given, family), full in zip(rows, people, names):
        relation = str(row.get('individual_role_code') or '1')
        ordinals[relation] = ordinals.get(relation, 0) + 1
        dob, age = jitter_dob(row.get('dob'), today)
        nested = row.get('json_ext') if isinstance(row.get('json_ext'), dict) else {}
        inner = {k: v for k, v in nested.items() if k != 'raw'}
        inner.update(raw=scrub_raw(nested.get('raw') or row.get('raw'), names, full, age),
                     gender=sex, pmt_score=score, pmt_class=klass)
        record = {k: row.get(k) for k in CSV_FIELDS if k != 'json_ext'}
        record.update(first_name=given, last_name=family, dob=dob, gender=sex, group_code=code,
                      interview_key=interview_key, external_id=f'{code}-{relation}-{ordinals[relation]:02d}',
                      location_code=village_code, pmt_score=score, pmt_class=klass, json_ext=inner)
        records.append(record)
    return records


def import_registry(user, counts):
    """Select, anonymise and import; returns the uploads and the one whose PCT task stays open."""
    from api_etl.apps import ApiEtlConfig
    from api_etl.sinks.individual_import_sink import IndividualImportSink
    from individual.models import Group, IndividualDataSourceUpload

    today = timezone.now().date()
    codes = select_source(HOUSEHOLDS)
    if not codes:
        raise RuntimeError('No earlier imports to build the demo from (no staged P3 households).')
    source = load_rows(codes)
    from location.models import Location
    villages = {v.code: v for v in Location.objects.filter(
        type='V', validity_to__isnull=True,
        code__in={str(rows[0].get('location_code') or '').zfill(9) for rows in source.values()})
        .select_related('parent__parent')}
    used = set(Group.objects.filter(code__startswith='P3-').values_list('code', flat=True))

    by_district = {}
    for rows in source.values():
        village = villages.get(str(rows[0].get('location_code') or '').zfill(9))
        records = anonymise(rows, used, today, RNG.random() < POOR_SHARE)
        by_district.setdefault(district_name(village), []).append(records)
    order = sorted(by_district, key=lambda d: -len(by_district[d]))
    counts['source households'] = len(source)

    base = {k: v for k, v in vars(ApiEtlConfig).items() if not k.startswith('_')}
    uploads = []

    def push(name, households, maker_checker=False):
        config = {**base, 'sink_workflow': 'Python Valid Upload Individuals',
                  'sink_import_workflow': 'Python Valid Upload Individuals', 'sink_update_existing': False,
                  'sink_csv_fields': CSV_FIELDS, 'sink_group_aggregation_column': 'group_code',
                  'sink_enable_maker_checker': maker_checker}
        records = [r for household in households for r in household]
        IndividualImportSink(user, batch=name, config=config).push(records, batch_identifier=name)
        upload = (IndividualDataSourceUpload.objects.filter(source_name=f'{name}_new.csv')
                  .order_by('-date_created').first())
        if upload is None:
            raise RuntimeError(f'Import {name} left no upload')
        uploads.append(upload)
        print(f'    {name}: {len(households)} households, {len(records)} people -> {upload.status}')
        counts['uploads'] = counts.get('uploads', 0) + 1
        return upload

    late = []
    for district in order:
        take = min(AWAITING_IMPORT - len(late), len(by_district[district]) // 3)
        late += by_district[district][:take]
        by_district[district] = by_district[district][take:]
        if len(late) >= AWAITING_IMPORT:
            break
    if late:
        push(f'{SOURCE} late returns', late, maker_checker=True)
    for index, district in enumerate(order):
        households = by_district[district]
        if index == 1:
            members = [r for h in households for r in h if str(r.get('individual_role_code')) != '1']
            for record in RNG.sample(members, min(BLANK_SURNAMES, len(members))):
                record['last_name'] = ''
        push(f'{SOURCE} {district}', households)
    return uploads, uploads[-1]


def tag_rows(model, ids):
    """Add the seed tag to rows the import services created (they carry no tag of their own)."""
    from django.db import connection
    ids = [str(i) for i in ids]
    if not ids:
        return 0
    table, pk = model._meta.db_table, model._meta.pk.column
    col = model._meta.get_field('json_ext').column
    with connection.cursor() as cur:
        cur.execute(f'UPDATE "{table}" SET "{col}" = COALESCE("{col}", \'{{}}\'::jsonb) || %s::jsonb '
                    f'WHERE "{pk}" = ANY(%s::uuid[])', [json.dumps({'_seed': TAG}), ids])
        return cur.rowcount


def imported_households(uploads):
    from individual.models import GroupIndividual, IndividualDataSource
    people = list(IndividualDataSource.objects.filter(upload__in=uploads, individual__isnull=False)
                  .values_list('individual_id', flat=True))
    links = GroupIndividual.objects.filter(individual_id__in=people, is_deleted=False)
    return people, list(links.values_list('id', flat=True)), sorted(set(links.values_list('group_id', flat=True)))


def ensure_plan(user, counts, code, name, description):
    from social_protection.models import BenefitPlan
    live = BenefitPlan.objects.filter(is_deleted=False)
    existing = live.filter(code__in=[code, f'{code}G'],
                           type=BenefitPlan.BenefitPlanType.GROUP_TYPE).order_by('code').first()
    if existing:
        return existing
    if live.filter(code=code).exists():
        code = f'{code}G'
    counts['BenefitPlan'] = counts.get('BenefitPlan', 0) + 1
    return create(BenefitPlan, user, code=code, name=name, type=BenefitPlan.BenefitPlanType.GROUP_TYPE,
                  max_beneficiaries=30000, ceiling_per_beneficiary=Decimal('60000'),
                  beneficiary_data_schema={}, institution='TASAF', description=description,
                  date_valid_from=aware(date(2026, 1, 1), 0), json_ext=tagged())


def pct_programme(user, counts):
    from individual.apps import IndividualConfig
    return ensure_plan(user, counts, (IndividualConfig.pct_benefit_plan_code or 'PCT').strip(),
                       IndividualConfig.pct_benefit_plan_name or 'Productive Cash Transfer',
                       'Productive Cash Transfer - households that passed PMT')


def approve_pct_enrolment(user, uploads, keep_open, counts):
    """Approve the PCT enrolment task of every upload but ``keep_open`` (left for the Tasks demo)."""
    from individual.apps import IndividualConfig
    from individual.pct_enrolment import PctEnrolmentService
    from tasks_management.models import Task

    service = PctEnrolmentService(user)
    for upload in uploads:
        tasks = Task.objects.filter(is_deleted=False, business_event=IndividualConfig.pct_enrolment_task_event,
                                    json_ext__upload_id=str(upload.id))
        if upload.id == keep_open.id or upload.status == 'WAITING_FOR_VERIFICATION':
            counts['PCT enrolment tasks open'] = counts.get('PCT enrolment tasks open', 0) + tasks.count()
            continue
        result = service.enrol_upload(str(upload.id))
        tasks.update(status=Task.Status.COMPLETED)
        counts['PCT enrolled'] = counts.get('PCT enrolled', 0) + result.get('enrolments_created', 0)


def household_members(group_ids):
    """group id -> (head Individual, [(id, first, last, dob)])."""
    from individual.models import GroupIndividual
    members, heads = {}, {}
    for link in (GroupIndividual.objects.filter(group_id__in=group_ids, is_deleted=False)
                 .select_related('individual')):
        person = link.individual
        members.setdefault(link.group_id, []).append((person.id, person.first_name, person.last_name, person.dob))
        if link.role == 'HEAD':
            heads[link.group_id] = person
    return {g: (heads.get(g), rows) for g, rows in members.items() if heads.get(g)}


def working_age(rows, today):
    return any(18 <= (today - dob).days // 365 <= 60 for _i, _f, _l, dob in rows if dob)


def enrol_programmes(user, group_ids, counts):
    """PCT comes from the import's enrolment task; Public Works and Economic Inclusion are added
    here, and some PCT households are suspended or graduated (moved to Economic Inclusion)."""
    from social_protection.models import GroupBeneficiary

    today = timezone.now().date()
    pct_bp = pct_programme(user, counts)
    pwp_bp = ensure_plan(user, counts, 'PWP', 'Public Works Programme',
                         'Labour-intensive public works for PCT households with working-age members')
    ei_bp = ensure_plan(user, counts, '003', 'Economic Inclusion', 'Livelihood grant for graduating households')
    households = household_members(group_ids)
    pct = list(GroupBeneficiary.objects.filter(group_id__in=group_ids, benefit_plan=pct_bp, is_deleted=False)
               .order_by('date_created'))
    RNG.shuffle(pct)
    n = len(pct)
    graduated = pct[:int(n * GRADUATED_SHARE)]
    suspended = pct[len(graduated):len(graduated) + int(n * SUSPENDED_SHARE)]
    active = pct[len(graduated) + len(suspended):]
    GroupBeneficiary.objects.filter(id__in=[g.id for g in graduated]).update(status='GRADUATED')
    GroupBeneficiary.objects.filter(id__in=[g.id for g in suspended]).update(status='SUSPENDED')
    counts['PCT graduated'] = len(graduated)
    counts['PCT suspended'] = len(suspended)

    def join(bp, gbs, status='ACTIVE'):
        out = []
        for gb in gbs:
            out.append(create(GroupBeneficiary, user, group_id=gb.group_id, benefit_plan=bp, status=status,
                              date_valid_from=aware(date(2026, 4, 1), 0),
                              json_ext=tagged(enrolled_from=gb.benefit_plan.code)))
        counts[f'{bp.code} enrolled'] = counts.get(f'{bp.code} enrolled', 0) + len(out)
        return out

    able = [gb for gb in active if working_age(households.get(gb.group_id, (None, []))[1], today)]
    pwp = join(pwp_bp, RNG.sample(able, int(len(able) * PWP_SHARE)))
    ei = join(ei_bp, graduated + RNG.sample(active, int(len(active) * EI_SHARE)))

    def rows(gbs, extra):
        out = []
        for gb in gbs:
            head, members = households.get(gb.group_id, (None, []))
            if head:
                gb.refresh_from_db(fields=['status'])
                out.append((gb, head, extra(members)))
        return out

    return {
        'pct_bp': pct_bp, 'pwp_bp': pwp_bp, 'ei_bp': ei_bp,
        'pct': rows(pct, lambda m: household_breakdown(m, today)),
        'pwp': rows(pwp, lambda _m: {'days_worked': RNG.randint(8, 20), 'daily_rate': PWP_DAILY_RATE}),
        'ei': rows(ei, lambda _m: {}),
    }


# ── 2. payment chain ──────────────────────────────────────────────────────────

def household_breakdown(member_rows, today):
    rule = {k: Decimal(v) for k, v in PCT_RULE.items() if v.isdigit()}
    ages = [(today - m[3]).days // 365 for m in member_rows if m[3]]
    young = sum(1 for a in ages if a <= 5)
    primary = sum(1 for a in ages if 6 <= a <= 13)
    secondary = sum(1 for a in ages if 14 <= a <= 19)
    disability = RNG.random() < 0.12
    yc, pc, sc = min(young, 3), min(primary, 3), min(secondary, 3)
    parts = {
        'base_amount': rule['base_amount'],
        'young_child_amount': rule['young_child_unit'] * yc,
        'primary_amount': rule['primary_unit'] * pc,
        'secondary_amount': rule['secondary_unit'] * sc,
        'disability_amount': rule['disability_top_up'] if disability else Decimal('0'),
    }
    raw = sum(parts.values())
    capped = min(raw, rule['household_cap_amount'])
    return {
        **{k: int(v) for k, v in parts.items()},
        'young_child_count_raw': young, 'young_child_count': yc,
        'primary_count_raw': primary, 'primary_count': pc,
        'secondary_count_raw': secondary, 'secondary_count': sc,
        'has_disability': disability, 'raw_total': int(raw), 'capped_total': int(capped),
        'household_cap_amount': int(rule['household_cap_amount']),
    }


def seed_payment_chain(user, programmes, counts):
    from contribution_plan.models import PaymentPlan
    from invoice.models import Bill
    from payment_cycle.models import PaymentCycle
    from payroll.models import (
        BenefitAttachment, BenefitConsumption, Payroll, PayrollBenefitConsumption, PayrollBill,
    )
    from social_protection.models import BenefitPlan, GroupBeneficiary
    from tasaf_payment.charges import ChargeError, gross_up, normalise_fsp
    from tasaf_payment.models import (
        FspMapping, MuseVerificationRecord, Paylist, PaylistItem, PaymentAccount, ReturnFeedback,
    )
    from tasaf_payment.services import PaylistService
    from muse_payment_adaptor.models import MuseTransactionLog
    from calcrule_pct_payment.calculation_rule import PctPaymentCalculationRule

    def bump(key, n=1):
        counts[key] = counts.get(key, 0) + n

    pct_bp, pwp_bp, ei_bp = programmes['pct_bp'], programmes['pwp_bp'], programmes['ei_bp']
    beneficiaries = programmes['pct'] + programmes['pwp'] + programmes['ei']

    for name, code, fsp_type, _w, bic in FSPS:
        if not FspMapping.objects.filter(is_deleted=False, fsp_name_key=normalise_fsp(name)).exists():
            create(FspMapping, user, fsp_name=name, fsp_code=code, json_ext=tagged())
            bump('FspMapping')

    bp_type = ContentType.objects.get_for_model(BenefitPlan)

    def payment_plan(code, name, bp, periodicity, rule):
        existing = PaymentPlan.objects.filter(code=code, is_deleted=False).first()
        if existing:
            return existing
        bump('PaymentPlan')
        return create(PaymentPlan, user, code=code, name=name, calculation=PctPaymentCalculationRule.uuid,
                      benefit_plan_type=bp_type, benefit_plan_id=str(bp.id), periodicity=periodicity,
                      date_valid_from=aware(date(2026, 1, 1), 0), json_ext=tagged(calculation_rule=rule))

    pct_plan = payment_plan('PCT-MONTHLY', 'PCT Monthly Payment Plan', pct_bp, 1, PCT_RULE)
    ei_plan = payment_plan('ECON-QUARTERLY', 'Economic Inclusion Quarterly Plan', ei_bp, 3, EI_RULE)
    pwp_plan = payment_plan('PWP-MONTHLY', 'Public Works Wages Plan', pwp_bp, 1, PWP_RULE)

    def cycle(code, start, end):
        existing = PaymentCycle.objects.filter(code=code, is_deleted=False).first()
        if existing:
            return existing
        bump('PaymentCycle')
        return create(PaymentCycle, user, code=code, start_date=start, end_date=end, status='ACTIVE',
                      json_ext=tagged())

    c_janfeb = cycle('Jan - Feb 2026', date(2026, 1, 1), date(2026, 2, 28))
    c_marapr = cycle('Mar - Apr 2026', date(2026, 3, 1), date(2026, 4, 30))
    c_mayjun = cycle('May - Jun 2026', date(2026, 5, 1), date(2026, 6, 30))
    c_julaug = cycle('Jul - Aug 2026', date(2026, 7, 1), date(2026, 8, 31))
    c_sepoct = cycle('Sep - Oct 2026', date(2026, 9, 1), date(2026, 10, 31))
    c_q3 = cycle('Q3 2026 (Jul - Sep)', date(2026, 7, 1), date(2026, 9, 30))

    accounts, wallets = {}, {}
    for gb, head, _b in beneficiaries:
        if gb.group_id not in wallets:
            wallets[gb.group_id] = RNG.choices(FSPS, weights=[f[3] for f in FSPS])[0]
        name, code, fsp_type, _w, _bic = wallets[gb.group_id]
        verification = weighted(VERIFICATION)
        invalid_mobile = fsp_type == 'MOBILE' and RNG.random() < INVALID_MOBILE_SHARE
        failures = []
        if verification == 1:
            pre_audit = weighted([('PASSED', 93), ('FAILED', 4), ('PENDING', 3)])
            if invalid_mobile:
                pre_audit, failures = 'FAILED', ['INVALID_MOBILE_NUMBER']
            elif pre_audit == 'FAILED':
                failures = [RNG.choice(['BENEFICIARY_INACTIVE', 'NOT_PRIMARY'])]
        else:
            pre_audit = 'PENDING'
        active = weighted([('ACTIVE', 70), ('PENDING', 25), ('INACTIVE', 5)]) if pre_audit == 'PASSED' else 'PENDING'
        if fsp_type == 'MOBILE':
            number = (f'2557{RNG.randint(10**8, 10**9 - 1)}' if invalid_mobile
                      else f'255{RNG.choice("67")}{RNG.randint(10**7, 10**8 - 1)}')
        else:
            number = str(RNG.randint(10**11, 10**12 - 1))
        holder = f'{head.first_name} {head.last_name}'.upper()
        ext = tagged(**({'pre_audit_failures': failures} if failures else {}))
        account = create(PaymentAccount, user, group_beneficiary=gb, account_number=number,
                         account_name=holder, fsp_type=fsp_type, fsp_name=name,
                         verification_status=verification, pre_audit_status=pre_audit,
                         active_check_status=active, is_primary=True,
                         contact_phone=number if fsp_type == 'MOBILE' else None,
                         muse_verification_reference=f'MVR{RNG.randint(10**8, 10**9 - 1)}' if verification else None,
                         json_ext=ext)
        accounts[gb.id] = account
        if verification in (1, 2, 3):
            result = {1: 'PASSED', 2: 'FAILED', 3: 'MANUAL'}[verification]
            reason = (RNG.choice(FAIL_REASONS) if result == 'FAILED'
                      else RNG.choice(MANUAL_REASONS) if result == 'MANUAL' else None)
            create(MuseVerificationRecord, user, payment_account=account,
                   muse_reference=account.muse_verification_reference,
                   verification_type='MOBILE_VALIDATION' if fsp_type == 'MOBILE' else 'FSP_ACCOUNT',
                   result=result, failure_reason=reason,
                   raw_response={'demo': True, 'result': result, 'fsp': code, **({'reason': reason} if reason else {})},
                   json_ext=tagged())
            bump('MuseVerificationRecord')
    bump('PaymentAccount', len(accounts))

    gb_type = ContentType.objects.get_for_model(GroupBeneficiary)
    pp_type = ContentType.objects.get_for_model(PaymentPlan)
    bc_status = {'RECONCILED': 'RECONCILED', 'APPROVE_FOR_PAYMENT': 'APPROVE_FOR_PAYMENT',
                 'PENDING_APPROVAL': 'ACCEPTED', 'REJECTED': 'REJECTED'}
    bill_status = {'RECONCILED': 2, 'APPROVE_FOR_PAYMENT': 1, 'PENDING_APPROVAL': 1, 'REJECTED': 3}

    def build_payroll(name, pay_plan, pay_cycle, status, bp, prefix, limit=None):
        payroll = create(Payroll, user, name=name, payment_plan=pay_plan, payment_cycle=pay_cycle,
                         status=status, payment_method='StrategyMusePayment',
                         date_valid_from=aware(pay_cycle.start_date, 0),
                         date_valid_to=aware(pay_cycle.end_date, 23), json_ext=tagged())
        rows = [(gb, head, b) for gb, head, b in beneficiaries if gb.benefit_plan_id == bp.id and gb.status == 'ACTIVE']
        if limit:
            rows = rows[:limit]
        benefits = []
        for seq, (gb, head, breakdown) in enumerate(rows, start=1):
            if bp.id == ei_bp.id:
                amount = EI_AMOUNT
            elif bp.id == pwp_bp.id:
                amount = Decimal(breakdown['days_worked'] * breakdown['daily_rate'])
            else:
                amount = Decimal(breakdown['capped_total'])
            benefit = create(
                BenefitConsumption, user, individual=head, code=f'{prefix}{seq:05d}', amount=amount,
                type='Cash Transfer', date_due=pay_cycle.end_date, status=bc_status[status],
                receipt=f'RCPT{RNG.randint(10**7, 10**8 - 1)}' if status == 'RECONCILED' else None,
                date_valid_from=aware(pay_cycle.start_date, 0),
                json_ext=tagged(benefit_plan_code=bp.code, beneficiary_group_id=str(gb.group_id),
                                **({'pct_breakdown': breakdown} if bp.id == pct_bp.id else
                                   {'public_works': breakdown} if bp.id == pwp_bp.id else {})))
            create(PayrollBenefitConsumption, user, payroll=payroll, benefit=benefit, json_ext=tagged())
            bill = create(
                Bill, user, code=bill_code(), subject_type=pp_type, subject_id=str(pay_plan.id),
                thirdparty_type=gb_type, thirdparty_id=str(gb.id), amount_net=amount, amount_total=amount,
                status=bill_status[status], currency_tp_code='TZS', currency_code='TZS',
                date_bill=pay_cycle.start_date, date_due=pay_cycle.end_date,
                date_payed=pay_cycle.end_date if status == 'RECONCILED' else None,
                note=(pay_plan.json_ext or {}).get('calculation_rule', {}).get('invoice_label'),
                date_valid_from=aware(pay_cycle.start_date, 0), json_ext=tagged())
            create(BenefitAttachment, user, benefit=benefit, bill=bill,
                   date_valid_from=aware(pay_cycle.start_date, 0), json_ext=tagged())
            create(PayrollBill, user, payroll=payroll, bill=bill, json_ext=tagged())
            benefits.append((gb, benefit))
        bump('Payroll')
        bump('BenefitConsumption', len(benefits))
        bump('Bill', len(benefits))
        return payroll, benefits

    p_janfeb = build_payroll('PCT Jan - Feb 2026', pct_plan, c_janfeb, 'RECONCILED', pct_bp, 'PCT2601')
    p_marapr = build_payroll('PCT Mar - Apr 2026', pct_plan, c_marapr, 'APPROVE_FOR_PAYMENT', pct_bp, 'PCT2603')
    p_mayjun = build_payroll('PCT May - Jun 2026', pct_plan, c_mayjun, 'APPROVE_FOR_PAYMENT', pct_bp, 'PCT2605')
    p_julaug = build_payroll('PCT Jul - Aug 2026', pct_plan, c_julaug, 'APPROVE_FOR_PAYMENT', pct_bp, 'PCT2607')
    build_payroll('PCT Sep - Oct 2026', pct_plan, c_sepoct, 'PENDING_APPROVAL', pct_bp, 'PCT2609')
    build_payroll('PCT Sep - Oct 2026 (first draft)', pct_plan, c_sepoct, 'REJECTED', pct_bp, 'PCT2609R', limit=25)
    p_ei = build_payroll('Economic Inclusion Q3 2026', ei_plan, c_q3, 'APPROVE_FOR_PAYMENT', ei_bp, 'EI2607')
    p_pwp_mayjun = build_payroll('Public Works May - Jun 2026', pwp_plan, c_mayjun, 'RECONCILED', pwp_bp, 'PW2605')
    p_pwp_julaug = build_payroll('Public Works Jul - Aug 2026', pwp_plan, c_julaug, 'APPROVE_FOR_PAYMENT',
                                 pwp_bp, 'PW2607')

    def payable(benefits, fsp_type):
        out = []
        for gb, benefit in benefits:
            account = accounts[gb.id]
            if account.verification_status == 1 and account.pre_audit_status == 'PASSED' and account.fsp_type == fsp_type:
                out.append((account, benefit))
        return out

    def charge_for(account, net):
        try:
            return gross_up(account.fsp_name, net)[1] or Decimal('0')
        except ChargeError:
            return Decimal('0')

    sent_statuses = ('SUBMITTED', 'RECEIVED', 'ACCEPTED', 'SENT_TO_BANK', 'REJECTED', 'CLOSED')
    batch_desc = {'RECEIVED': 'Batch received', 'ACCEPTED': 'Batch accepted',
                  'SENT_TO_BANK': 'Batch sent to bank', 'REJECTED': 'Rejected: invalid payer account',
                  'CLOSED': 'Batch completed'}
    paylist_service = PaylistService(user)
    demo_paylists = []

    def build_paylist(payroll, pay_cycle, batch_type, status, rows, item_weights):
        end = pay_cycle.end_date
        sent = status in sent_statuses
        approved = sent or status == 'APPROVED'
        stamps = {
            'generated_at': aware(end - timedelta(days=24)),
            'approved_at': aware(end - timedelta(days=22)) if approved else None,
            'submitted_at': aware(end - timedelta(days=21)) if sent else None,
            'closed_at': aware(end + timedelta(days=10)) if status == 'CLOSED' else None,
        }
        mid = msg_id() if sent else None
        paylist = create(Paylist, user, payroll=payroll, payment_cycle=pay_cycle, batch_type=batch_type,
                         destination='MUSE', status=status,
                         muse_batch_reference=f'MUSEB{RNG.randint(10**6, 10**7 - 1)}' if sent else None,
                         muse_msg_id=mid, muse_status_desc=batch_desc.get(status),
                         muse_status_at=aware(end - timedelta(days=20), 11) if status in batch_desc else None,
                         batch_group=uuid.uuid4(), batch_sequence=1, batch_total=1, json_ext=tagged(), **stamps)
        demo_paylists.append(paylist)
        total = Decimal('0')
        for account, benefit in rows:
            item_status = weighted(item_weights)
            net = benefit.amount
            charge = charge_for(account, net)
            total += net + charge
            item = create(PaylistItem, user, paylist=paylist, payment_account=account,
                          benefit_consumption=benefit, net_amount=net, charge_amount=charge,
                          amount=net + charge, status=item_status,
                          muse_reference=f'MUSE{RNG.randint(10**9, 10**10 - 1)}' if sent else None,
                          settled_at=(aware(end - timedelta(days=RNG.randint(1, 18)), 14)
                                      if item_status == 'PROCESSED' else None),
                          json_ext=tagged())
            bump('PaylistItem')
            if item_status == 'UNAPPLIED':
                reason_code, description = RNG.choice(RETURN_REASONS)
                create(ReturnFeedback, user, paylist_item=item, feedback_type='UNAPPLIED',
                       reason_code=reason_code, reason_description=description, json_ext=tagged())
                item.return_reason = description
                item.save(user=user)
                bump('ReturnFeedback')
        if sent:
            logs = [('BULK_PAYMENT', 'OUT', 'SUCCESS', 200)]
            if status in batch_desc:
                logs += [('ACK', 'IN', 'SUCCESS', 200), ('RESPONSE', 'IN', 'REJECTED' if status == 'REJECTED' else 'SUCCESS', 200)]
            for ttype, direction, lstatus, http in logs:
                MuseTransactionLog.objects.create(
                    transaction_type=ttype, status=lstatus, direction=direction, msg_id=mid,
                    batch_reference=paylist.muse_batch_reference or '', paylist_uuid=str(paylist.id),
                    item_count=len(rows), amount=total, http_status_code=http, attempt_number=1,
                    response_body='{"demo": true}')
                bump('MuseTransactionLog')
        if status == 'PENDING_APPROVAL':
            paylist_service._start_paylist_approval(paylist)
            bump('ApprovalRequest')
        bump('Paylist')

    settled = [('PROCESSED', 90), ('UNAPPLIED', 10)]
    waiting = [('PENDING', 100)]
    in_bank = [('PENDING', 45), ('PROCESSED', 50), ('UNAPPLIED', 5)]
    plan = [
        (p_janfeb, c_janfeb, 'BANK', 'CLOSED', settled), (p_janfeb, c_janfeb, 'MNO', 'CLOSED', settled),
        (p_marapr, c_marapr, 'BANK', 'SENT_TO_BANK', in_bank), (p_marapr, c_marapr, 'MNO', 'ACCEPTED', waiting),
        (p_mayjun, c_mayjun, 'BANK', 'RECEIVED', waiting), (p_mayjun, c_mayjun, 'MNO', 'REJECTED', waiting),
        (p_julaug, c_julaug, 'BANK', 'SUBMITTED', waiting), (p_julaug, c_julaug, 'MNO', 'APPROVED', waiting),
        (p_ei, c_q3, 'BANK', 'PENDING_APPROVAL', waiting), (p_ei, c_q3, 'MNO', 'REJECTED_AT_APPROVAL', waiting),
        (p_pwp_mayjun, c_mayjun, 'MNO', 'CLOSED', settled), (p_pwp_mayjun, c_mayjun, 'BANK', 'CLOSED', settled),
        (p_pwp_julaug, c_julaug, 'MNO', 'SENT_TO_BANK', in_bank),
    ]
    for (payroll, benefits), pay_cycle, batch_type, status, weights in plan:
        build_paylist(payroll, pay_cycle, batch_type, status,
                      payable(benefits, 'BANK' if batch_type == 'BANK' else 'MOBILE'), weights)
    return accounts


# ── 3. case management and grievances ───────────────────────────────────────

def ticket_text(text):
    """Exactly 45 words: servers differ (at least 45 here, at most 45 on older grievance code)."""
    return ' '.join(text.split()[:45]).rstrip('.,') + '.'


def seed_grievances(user, beneficiaries, counts):
    from grievance_social_protection.models import GrievanceCategory, GrievanceChannel, GrievanceType
    from grievance_social_protection.services import TicketService

    if not GrievanceCategory.objects.exists():
        call_command('seed_grievances')
    categories = list(GrievanceCategory.objects.filter(is_active=True))
    types = {}
    for t in GrievanceType.objects.filter(is_active=True):
        types.setdefault(t.category_id, []).append(t)
    channels = list(GrievanceChannel.objects.values_list('name', flat=True)) or ['Web']
    if not categories:
        print('  no grievance categories; tickets skipped')
        return
    service = TicketService(user)
    today = timezone.now().date()
    failures = 0
    for _n in range(min(TICKETS, len(beneficiaries))):
        gb, head, _b = RNG.choice(beneficiaries)
        category = RNG.choice(categories)
        gtype = RNG.choice(types.get(category.id) or [None])
        status = weighted(TICKET_STATUS)
        incident = today - timedelta(days=RNG.randint(3, 150))
        data = {
            'title': gtype.name if gtype else category.name,
            'description': ticket_text(RNG.choice(TICKET_TEXT)),
            'reporter_type': 'individual', 'reporter_id': str(head.id),
            'date_of_incident': incident, 'status': status, 'priority': weighted(TICKET_PRIORITY),
            'category': category.name, 'channel': RNG.choice(channels),
            'due_date': incident + timedelta(days=category.timeline or 30),
            'event_location_id': head.location_id, 'consent_given': True,
            'resolution': (f'{RNG.randint(1, 30)},{RNG.randint(0, 23)}'
                           if status in ('RESOLVED', 'CLOSED') else None),
            'json_ext': tagged(),
        }
        try:
            with transaction.atomic():
                res = service.create(data)
        except Exception as exc:
            res = {'success': False, 'message': str(exc)}
        if res.get('success'):
            counts['Ticket'] = counts.get('Ticket', 0) + 1
        elif failures < 3:
            failures += 1
            print(f"  ticket create failed: {res.get('message')} {res.get('detail', '')}")


def seed_case_management(beneficiaries, counts):
    picked = RNG.sample(beneficiaries, min(CASE_HOUSEHOLDS, len(beneficiaries)))
    for gb, _head, _b in picked:
        call_command('seed_case_demo', group=gb.group.code, stdout=open(os.devnull, 'w'))
    counts['case households'] = len(picked)


EVENTS = [
    ('Community payment day briefing', 'COMPLETED', -40, 'Village meeting on payment dates, wallets and how to complain.'),
    ('Public Works site orientation', 'COMPLETED', -15, 'Safety, attendance and wage rules for new Public Works participants.'),
    ('Livelihood and savings group launch', 'SCHEDULED', 12, 'Launch of savings groups for Economic Inclusion households.'),
]


def seed_events(user, programmes, counts):
    """Community events whose attendance register points at demo beneficiaries."""
    from communications.models import (
        ActivityParticipant, ActivityType, AttendanceStatus, CommunicationActivity, EventType, StakeholderType,
    )
    beneficiaries = StakeholderType.objects.filter(code='BENEFICIARIES', is_deleted=False).first()
    pools = [programmes['pct'], programmes['pwp'] or programmes['pct'], programmes['ei'] or programmes['pct']]
    now = timezone.now()
    for n, ((title, status, offset, description), pool) in enumerate(zip(EVENTS, pools), start=1):
        if not pool:
            continue
        village = pool[0][1].location
        start = now + timedelta(days=offset)
        invited = RNG.sample(pool, min(len(pool), RNG.randint(25, 45)))
        event = create(CommunicationActivity, user, code=f'EVT-DEMO-{n:03d}', title=title, description=description,
                       activity_type=ActivityType.EVENT, event_type=EventType.PUBLIC, start_datetime=start,
                       end_datetime=start + timedelta(hours=3), venue=f'{village.name} village office' if village else None,
                       location=village, target_audience='Beneficiary households', status=status,
                       planned_audience_count=len(invited), json_ext=tagged())
        attended = 0
        for _gb, head, _b in invited:
            if status == 'COMPLETED':
                attendance = AttendanceStatus.ATTENDED if RNG.random() < 0.82 else AttendanceStatus.ABSENT
            else:
                attendance = AttendanceStatus.CONFIRMED if RNG.random() < 0.6 else AttendanceStatus.INVITED
            attended += attendance == AttendanceStatus.ATTENDED
            create(ActivityParticipant, user, activity=event, full_name=f'{head.first_name} {head.last_name}',
                   gender=(head.json_ext or {}).get('gender'), stakeholder_type=beneficiaries,
                   location=head.location, attendance_status=attendance, individual=head,
                   title='Household head', json_ext=tagged())
        if status == 'COMPLETED':
            event.actual_audience_count = attended
            event.save(user=user)
        counts['Event'] = counts.get('Event', 0) + 1
        counts['ActivityParticipant'] = counts.get('ActivityParticipant', 0) + len(invited)


def seed_modules():
    for command, kwargs in [('seed_pending_demo', {}), ('seed_media_registry_demo', {}),
                            ('seed_coordination_demo', {}), ('seed_training_demo', {}),
                            ('seed_demo_notifications', {})]:
        try:
            call_command(command, **kwargs)
        except Exception as exc:
            print(f'  {command} failed: {exc}')


# ── undo ──────────────────────────────────────────────────────────────────────

def undo():
    from approval.models import ApprovalDecision, ApprovalRequest, ApprovalStep
    from communications.models import ActivityParticipant, CommunicationActivity
    from contribution_plan.models import PaymentPlan
    from grievance_social_protection.models import Ticket
    from individual.models import (
        Group, GroupIndividual, Individual, IndividualDataSource, IndividualDataSourceUpload,
        IndividualDataUploadRecords, PmtEnrollment,
    )
    from invoice.models import Bill
    from muse_payment_adaptor.models import MuseTransactionLog
    from notifications.models import Notification
    from payment_cycle.models import PaymentCycle
    from payroll.models import (
        BenefitAttachment, BenefitConsumption, Payroll, PayrollBenefitConsumption, PayrollBill,
    )
    from social_protection.models import BenefitPlan, GroupBeneficiary
    from tasaf_payment.models import (
        FspMapping, MuseVerificationRecord, Paylist, PaylistItem, PaymentAccount, ReturnFeedback,
    )
    from tasks_management.models import Task, TaskExecutor, TaskGroup

    for command, kwargs in [('seed_demo_notifications', {'clear_only': True}), ('seed_training_demo', {'clear': True}),
                            ('seed_coordination_demo', {'purge': True}), ('seed_media_registry_demo', {'purge': True}),
                            ('seed_case_demo', {'undo': True}), ('seed_pending_demo', {'undo': True})]:
        try:
            call_command(command, **kwargs)
        except Exception as exc:
            print(f'  {command} undo failed: {exc}')

    tag = {'json_ext__contains': {'_seed': TAG}}
    try:
        with transaction.atomic():
            paylist_ids = [str(i) for i in Paylist.objects.filter(**tag).values_list('id', flat=True)]
            requests = ApprovalRequest.objects.filter(
                content_type=ContentType.objects.get_for_model(Paylist), object_id__in=paylist_ids)
            steps = ApprovalStep.objects.filter(approval_request__in=requests)
            sources = [f'approval:{s}' for s in steps.values_list('id', flat=True)]
            request_refs = [str(r) for r in requests.values_list('id', flat=True)]
            Notification.objects.filter(source_ref__in=request_refs + paylist_ids).delete()
            tasks = Task.objects.filter(source__in=sources)
            groups = TaskGroup.objects.filter(id__in=tasks.values('task_group_id'))
            group_ids = list(groups.values_list('id', flat=True))
            print(f'  deleted {tasks.delete()[0]:6d} approval tasks')
            TaskExecutor.objects.filter(task_group_id__in=group_ids).delete()
            TaskGroup.objects.filter(id__in=group_ids).delete()
            ApprovalDecision.objects.filter(step__in=steps).delete()
            steps.delete()
            print(f'  deleted {requests.delete()[0]:6d} approval requests')
            print(f'  deleted {MuseTransactionLog.objects.filter(paylist_uuid__in=paylist_ids).delete()[0]:6d} MuseTransactionLog')
            uploads = IndividualDataSourceUpload.objects.filter(**tag)
            upload_ids = [str(u) for u in uploads.values_list('id', flat=True)]
            import_tasks = (Task.objects.filter(json_ext__upload_id__in=upload_ids)
                            | Task.objects.filter(json_ext__data_upload_id__in=upload_ids))
            Notification.objects.filter(source_ref__in=[str(t) for t in import_tasks.values_list('id', flat=True)]).delete()
            print(f'  deleted {import_tasks.delete()[0]:6d} import / PCT enrolment tasks')
            print(f'  deleted {IndividualDataSource.objects.filter(upload__in=uploads).delete()[0]:6d} staged import rows')
            IndividualDataUploadRecords.objects.filter(data_upload__in=uploads).delete()
            for model in [ActivityParticipant, CommunicationActivity, PmtEnrollment]:
                n, _ = model.objects.filter(**tag).delete()
                print(f'  deleted {n:6d} {model.__name__}')
            for model in [Ticket, ReturnFeedback, PaylistItem, Paylist, MuseVerificationRecord, PaymentAccount,
                          BenefitAttachment, PayrollBill, Bill, PayrollBenefitConsumption, BenefitConsumption,
                          Payroll, PaymentCycle, PaymentPlan, GroupBeneficiary, BenefitPlan, FspMapping,
                          GroupIndividual, Group, Individual, IndividualDataSourceUpload]:
                n, _ = model.objects.filter(**tag).delete()
                print(f'  deleted {n:6d} {model.__name__}')
    except IntegrityError as exc:
        print('UNDO ABORTED, nothing deleted: a non-demo row still points at demo data.')
        print(f'  {exc}')
        return
    print('Undo complete.')


# ── main ──────────────────────────────────────────────────────────────────────

def seed():
    from individual.models import Group, GroupIndividual, Individual, IndividualDataSourceUpload, PmtEnrollment
    from social_protection.models import GroupBeneficiary

    tag = {'json_ext__contains': {'_seed': TAG}}
    if Group.objects.filter(**tag).exists() or IndividualDataSourceUpload.objects.filter(**tag).exists():
        print(f"Already seeded (rows tagged '{TAG}' exist). Run with SEED_UNDO=1 first.")
        return
    user = seed_user()
    if user is None:
        print('No core user to attribute the seed to.')
        return
    counts = {}
    print(f'1/5 import: {HOUSEHOLDS} real households, anonymised, one upload per district ...')
    pct_programme(user, counts)
    uploads, keep_open = import_registry(user, counts)
    tag_rows(IndividualDataSourceUpload, [u.id for u in uploads])
    people, links, group_ids = imported_households(uploads)
    counts['Individual'] = tag_rows(Individual, people)
    counts['GroupIndividual'] = tag_rows(GroupIndividual, links)
    counts['Group'] = tag_rows(Group, group_ids)
    try:
        with transaction.atomic():
            print('2/5 enrolment: PCT task approval, Public Works, Economic Inclusion ...')
            approve_pct_enrolment(user, uploads, keep_open, counts)
            programmes = enrol_programmes(user, group_ids, counts)
            tag_rows(GroupBeneficiary, GroupBeneficiary.objects.filter(group_id__in=group_ids)
                     .values_list('id', flat=True))
            tag_rows(PmtEnrollment, PmtEnrollment.objects.filter(group_id__in=group_ids).values_list('id', flat=True))
            print('3/5 payment chain ...')
            seed_payment_chain(user, programmes, counts)
            print('4/5 grievance tickets, community events ...')
            seed_grievances(user, programmes['pct'], counts)
            seed_events(user, programmes, counts)
    except Exception:
        print('FAILED after the import: run again with SEED_UNDO=1 to remove the imported households.')
        raise
    print('    case management ...')
    seed_case_management(programmes['pct'], counts)
    if not SKIP_MODULES:
        print('5/5 pending updates, communications, coordination, training, notifications ...')
        seed_modules()
    print(f"\nSeeded full demo (tag '{TAG}'):")
    for key, value in counts.items():
        print(f'  {key:26s} {value:7d}')
    print('Remove with SEED_UNDO=1.')


mute_opensearch()
if UNDO:
    undo()
else:
    seed()
