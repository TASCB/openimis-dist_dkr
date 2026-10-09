"""Withdrawal-charge bands (Tasaf Payments > Charges) for a server, from the TASAF tariff sheet.

The 159 bands of 12 FSPs from "Withdrawal charges.csv" (EPAYMENT_CODE / LOWER_AMOUNT /
UPPER_AMOUNT / WITHDRAWAL) are embedded below, so nothing else needs copying to the server. The
sheet's one malformed row (CRDB with blank bounds) is left out, as the CSV import does.

By default an FSP that already has bands is left alone. SEED_REPLACE=1 replaces its bands (the old
rows are soft-deleted and marked, so undo can bring them back). The bands are written directly,
without the maker-checker approval the Charges tab uses, and have no effective date.

Every created row is tagged json_ext._seed = 'charge_bands_seed'.

    docker compose exec -T backend python manage.py shell < scripts/demo/seed_charge_bands.py
    docker compose exec -T -e SEED_REPLACE=1 backend python manage.py shell < scripts/demo/seed_charge_bands.py
    docker compose exec -T -e SEED_ONLY=MPESA,AIRTELMONEY backend python manage.py shell < scripts/demo/seed_charge_bands.py
    docker compose exec -T -e SEED_UNDO=1 backend python manage.py shell < scripts/demo/seed_charge_bands.py
"""
import os
import uuid
from decimal import Decimal

from django.db import transaction

TAG = 'charge_bands_seed'
REPLACED = 'charge_bands_seed_replaced'
USERNAME = os.environ.get('SEED_USER', 'Admin')
UNDO = os.environ.get('SEED_UNDO') == '1'
REPLACE = os.environ.get('SEED_REPLACE') == '1'
ONLY = {c.strip().upper() for c in os.environ.get('SEED_ONLY', '').split(',') if c.strip()}

# fsp_code: [(lower_amount, upper_amount, withdrawal)]
BANDS = {
    'AIRTELMONEY': [
        (2000, 2999, 34), (3000, 3999, 54), (4000, 4999, 68), (5000, 6999, 150),
        (7000, 9999, 170), (10000, 14999, 350), (15000, 19999, 1394), (20000, 29999, 1394),
        (30000, 39999, 1750), (40000, 49999, 2300), (50000, 99999, 2700), (100000, 199999, 3600),
        (200000, 299999, 5100), (300000, 399999, 6000), (400000, 499999, 6500), (500000, 599999, 7000),
    ],
    'AKIBA': [
        (1, 19999, 1683), (20000, 39999, 1683), (40000, 49999, 2099), (50000, 99999, 2618),
        (100000, 199999, 4409),
    ],
    'AZANIA': [
        (1000, 9999, 700), (10000, 19999, 800), (20000, 39999, 1000), (40000, 49999, 1500),
        (50000, 99999, 2000), (100000, 199999, 3000), (200000, 499999, 5000), (500000, 999999, 6000),
    ],
    'CRDB': [
        (1, 999, 0), (1000, 1999, 0), (2000, 2999, 0), (3000, 3999, 0),
        (4000, 4999, 0), (5000, 6999, 0), (7000, 9999, 0), (10000, 14999, 0),
        (15000, 19999, 0), (20000, 29999, 0), (30000, 49999, 0), (50000, 99999, 0),
        (100000, 199999, 0), (200000, 299999, 0), (300000, 399999, 0), (400000, 599999, 0),
        (600000, 999999, 0),
    ],
    'EQUITY': [
        (1, 19000, 1739), (20000, 39999, 1739), (40000, 49999, 2099), (50000, 99999, 2618),
        (100000, 199999, 4409), (200000, 299999, 5173),
    ],
    'EZYPESA': [
        (1000, 1999, 385), (2000, 2999, 386), (3000, 3999, 619), (4000, 4999, 639),
        (5000, 6999, 870), (7000, 9999, 938), (10000, 14999, 680), (15000, 19999, 1080),
        (20000, 29999, 1080), (30000, 39999, 1080), (40000, 49999, 1360), (50000, 99999, 2080),
        (100000, 199999, 2700), (200000, 299999, 3600), (300000, 399999, 5100), (400000, 499000, 6000),
        (500000, 599000, 6500), (600000, 699999, 7000), (700000, 799999, 7500),
    ],
    'HALOPESA': [
        (1000, 1999, 310), (2000, 2999, 310), (3000, 3999, 419), (4000, 4999, 527),
        (5000, 6999, 850), (7000, 9999, 834), (10000, 14999, 1302), (15000, 19999, 1395),
        (20000, 29999, 1806), (30000, 39999, 1951), (40000, 49999, 2519), (50000, 99999, 3073),
        (100000, 199999, 4007), (200000, 299999, 5321), (300000, 399999, 6338), (400000, 499999, 6982),
        (500000, 599999, 7645), (600000, 699999, 8532),
    ],
    'MPESA': [
        (1000, 1999, 130), (2000, 2999, 310), (3000, 3999, 494), (4000, 4999, 677),
        (5000, 6999, 734), (7000, 9999, 1056), (10000, 14999, 1182), (15000, 19999, 1275),
        (20000, 29999, 1666), (30000, 39999, 1711), (40000, 49999, 2259), (50000, 99999, 3272),
        (100000, 199999, 4357), (200000, 299999, 6121), (300000, 399999, 7338), (400000, 499999, 7982),
        (500000, 599999, 8745), (600000, 699999, 9532),
    ],
    'NBC': [
        (1000, 1999, 0), (2000, 2999, 0), (3000, 3999, 0), (4000, 4999, 0),
        (5000, 6999, 0), (7000, 9999, 0), (10000, 14999, 0), (15000, 19999, 0),
        (20000, 49999, 0), (50000, 99999, 0), (100000, 299999, 0),
    ],
    'NMB': [
        (1, 3999, 1200), (4000, 4999, 1200), (5000, 6999, 1200), (7000, 9999, 1200),
        (10000, 14999, 1200), (15000, 19999, 1200), (20000, 29999, 1200), (30000, 39999, 1200),
        (40000, 49999, 1200), (50000, 99999, 1200), (100000, 199999, 1200), (200000, 299999, 1200),
        (300000, 399999, 1200), (400000, 499999, 1200), (500000, 599999, 1200), (600000, 699999, 1200),
    ],
    'TIGOPESA': [
        (1000, 1999, 300), (2000, 2999, 300), (3000, 3999, 480), (4000, 4999, 680),
        (5000, 6999, 640), (7000, 9999, 1070), (10000, 14999, 680), (15000, 19999, 1080),
        (20000, 29999, 1080), (30000, 39999, 1080), (40000, 49999, 1360), (50000, 99999, 2080),
        (100000, 199999, 2700), (200000, 299999, 3600), (300000, 399999, 5100), (400000, 499999, 6000),
        (500000, 599999, 6500), (600000, 699999, 7000),
    ],
    'TPB': [
        (1, 9999, 1599), (10000, 49999, 1599), (50000, 99999, 2118), (100000, 199999, 3609),
        (200000, 299999, 5773), (300000, 399999, 5997), (400000, 499999, 6236),
    ],
}


def seed_user():
    from core.models import User
    return User.objects.filter(username=USERNAME).first()


def undo():
    from tasaf_payment.models import WithdrawalCharge

    with transaction.atomic():
        n, _ = WithdrawalCharge.objects.filter(json_ext__contains={'_seed': TAG}).delete()
        print(f'  deleted  {n:4d} seeded bands')
        restored = 0
        for band in WithdrawalCharge.objects.filter(json_ext__contains={'_seed': REPLACED}):
            ext = {k: v for k, v in (band.json_ext or {}).items() if k != '_seed'}
            WithdrawalCharge.objects.filter(id=band.id).update(is_deleted=False, json_ext=ext)
            restored += 1
        print(f'  restored {restored:4d} bands the seed had replaced')
    print('Undo complete.')


def seed():
    from tasaf_payment.charges import coverage, normalise_fsp, seed_fsp_mappings, validate_band_set
    from tasaf_payment.models import WithdrawalCharge

    user = seed_user()
    if user is None:
        print(f'No user {USERNAME!r}; set SEED_USER.')
        return
    codes = [c for c in sorted(BANDS) if not ONLY or c in ONLY]
    unknown = ONLY - set(BANDS)
    if unknown:
        print(f"Not in the tariff sheet (ignored): {', '.join(sorted(unknown))}")

    with transaction.atomic():
        mappings = seed_fsp_mappings(user)
        written, skipped = {}, []
        for code in codes:
            code = normalise_fsp(code)
            bands = [{'lower_amount': lo, 'upper_amount': hi, 'withdrawal': wd} for lo, hi, wd in BANDS[code]]
            errors = validate_band_set(bands)
            if errors:
                print(f'  {code}: not loaded -', '; '.join(errors))
                continue
            existing = WithdrawalCharge.objects.filter(is_deleted=False, fsp_code=code)
            if existing.exists():
                if not REPLACE:
                    skipped.append(f'{code} ({existing.count()})')
                    continue
                for band in existing:
                    WithdrawalCharge.objects.filter(id=band.id).update(
                        is_deleted=True, json_ext={**(band.json_ext or {}), '_seed': REPLACED})
            WithdrawalCharge.objects.bulk_create([WithdrawalCharge(
                id=uuid.uuid4(), fsp_code=code, lower_amount=Decimal(lo), upper_amount=Decimal(hi),
                withdrawal=Decimal(wd), is_deleted=False, version=1,
                user_created=user, user_updated=user, json_ext={'_seed': TAG},
            ) for lo, hi, wd in BANDS[code]])
            written[code] = len(BANDS[code])

    print(f"Seeded '{TAG}': {sum(written.values())} bands for {len(written)} FSPs"
          + (f', {mappings} FSP name mappings added' if mappings else ''))
    for code, n in written.items():
        cov = coverage(code)
        gaps = ', '.join(f"{g['from']}-{g['to']}" for g in cov['gaps'])
        print(f"  {code:12s} {n:3d} bands  {cov['lowest']} - {cov['highest']}"
              + (f'  gaps: {gaps}' if gaps else ''))
    if skipped:
        print(f"Left alone (already have bands; SEED_REPLACE=1 to replace): {', '.join(skipped)}")
    print('Remove with SEED_UNDO=1.')


if UNDO:
    undo()
else:
    seed()
