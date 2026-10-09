"""Five mobile-money (MNO) demo paylists for testing the MUSE send: 2 mixed + 3 single-MNO.

Builds one payroll (APPROVE_FOR_PAYMENT) of mobile-money payments for active PCT households and
runs the real paylist generator once per paylist, so each paylist starts its PAYMENT_APPROVAL like
a real one:

    mixed 1, mixed 2   payees rotate across M-Pesa, Airtel Money, Tigo Pesa, Halopesa
                       (generated with no FSP filter, like the "All MNOs" choice)
    MPESA, AIRTELMONEY, TIGOPESA
                       one MNO each (generated with that fsp_code, like the one-FSP Generate)

Households are reused only when their single primary account is already a verified,
pre-audit-passed mobile account of the MNO a slot needs, or when they have no primary account at
all (one is created with a valid 255XXXXXXXXX number on that MNO's prefix).

Every created row is tagged json_ext._seed = 'mno_paylist_demo'; undo cancels the approvals and
deletes exactly those rows.

    docker compose exec -T backend python manage.py shell < scripts/demo/seed_mno_paylists.py
    docker compose exec -T -e SEED_PER_PAYLIST=20 backend python manage.py shell < scripts/demo/seed_mno_paylists.py
    docker compose exec -T -e SEED_UNDO=1 backend python manage.py shell < scripts/demo/seed_mno_paylists.py

SEED_USER (default Admin) is the generator; approve the paylists with a different login.
"""
import os
import random
from datetime import date, datetime, time
from decimal import Decimal

from django.apps import apps
from django.db import transaction
from django.utils import timezone

TAG = 'mno_paylist_demo'
PER_PAYLIST = int(os.environ.get('SEED_PER_PAYLIST', '10'))
USERNAME = os.environ.get('SEED_USER', 'Admin')
UNDO = os.environ.get('SEED_UNDO') == '1'
RNG = random.Random(int(os.environ.get('SEED_RNG', '20261009')))
AMOUNTS = [14000, 19000, 21000, 26000, 33000, 40000, 50000]
CYCLE_CODE = 'MNO MUSE test Oct 2026'
PAYROLL_NAME = 'MNO MUSE test Oct 2026'

# fsp_code -> (account display name, national prefixes after 255)
MNOS = {
    'MPESA': ('Vodacom M-Pesa', ['74', '75', '76']),
    'AIRTELMONEY': ('Airtel Money', ['68', '69', '78']),
    'TIGOPESA': ('Tigo Pesa', ['65', '67', '71', '77']),
    'HALOPESA': ('Halopesa', ['61', '62']),
}
MIXED_ROTATION = ['MPESA', 'AIRTELMONEY', 'TIGOPESA', 'HALOPESA']
# (label, fsp_code for the generator or None for mixed, MNO of each slot)
PAYLISTS = [
    ('mixed 1', None, [MIXED_ROTATION[i % 4] for i in range(PER_PAYLIST)]),
    ('mixed 2', None, [MIXED_ROTATION[(i + 2) % 4] for i in range(PER_PAYLIST)]),
    ('MPESA', 'MPESA', ['MPESA'] * PER_PAYLIST),
    ('AIRTELMONEY', 'AIRTELMONEY', ['AIRTELMONEY'] * PER_PAYLIST),
    ('TIGOPESA', 'TIGOPESA', ['TIGOPESA'] * PER_PAYLIST),
]


def tagged(**extra):
    return {'_seed': TAG, **extra}


def aware(d, hour=0):
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
    return User.objects.filter(username=USERNAME).first()


def undo():
    from approval.models import ApprovalRequest
    from approval.services import ApprovalService
    from payment_cycle.models import PaymentCycle
    from payroll.models import BenefitConsumption, Payroll, PayrollBenefitConsumption
    from tasaf_payment.models import FspMapping, Paylist, PaylistItem, PaymentAccount

    user = seed_user()
    tag = {'json_ext__contains': {'_seed': TAG}}
    paylist_ids = [str(i) for i in Paylist.objects.filter(**tag).values_list('id', flat=True)]
    for req in ApprovalRequest.objects.filter(object_id__in=paylist_ids, status='PENDING'):
        print('  cancel approval', req.id, ApprovalService(user).cancel(req.id, 'MNO demo removed').get('success'))
    with transaction.atomic():
        n, _ = PaylistItem.objects.filter(paylist_id__in=paylist_ids).delete()
        print(f'  deleted {n:6d} PaylistItem')
        for model in [Paylist, PaymentAccount, PayrollBenefitConsumption, BenefitConsumption,
                      Payroll, PaymentCycle, FspMapping]:
            n, _ = model.objects.filter(**tag).delete()
            print(f'  deleted {n:6d} {model.__name__}')
    print('Undo complete.')


def seed():
    from contribution_plan.models import PaymentPlan
    from individual.models import GroupIndividual
    from payment_cycle.models import PaymentCycle
    from payroll.models import BenefitConsumption, Payroll, PayrollBenefitConsumption
    from social_protection.models import GroupBeneficiary
    from tasaf_payment import services
    from tasaf_payment.charges import ChargeError, resolve_fsp_code
    from tasaf_payment.models import FspMapping, FspProfile, Paylist, PaymentAccount
    from tasaf_payment.msisdn import is_valid
    from tasaf_payment.payee_code import HHID_RE

    if Payroll.objects.filter(json_ext__contains={'_seed': TAG}).exists():
        print(f"Already seeded (rows tagged '{TAG}' exist). Run with SEED_UNDO=1 first.")
        return
    user = seed_user()
    if user is None:
        print(f'No user {USERNAME!r}; set SEED_USER.')
        return

    def code_of(name):
        try:
            return resolve_fsp_code(name)
        except ChargeError:
            return None

    pct_plan = (PaymentPlan.objects.filter(is_deleted=False, code__in=['PCT-MONTHLY', 'PCT'])
                .order_by('code').first())
    if pct_plan is None:
        print('No PCT payment plan (PCT-MONTHLY) found.')
        return

    slots = [(index, mno) for index, (_, _, mnos) in enumerate(PAYLISTS) for mno in mnos]
    wanted = {}
    for _, mno in slots:
        wanted[mno] = wanted.get(mno, 0) + 1

    with transaction.atomic():
        fsp_names = {}
        for code, (display, _) in MNOS.items():
            if code not in wanted:
                continue
            mapping = next((m for m in FspMapping.objects.filter(is_deleted=False, fsp_code=code)
                            if code_of(m.fsp_name) == code), None)
            fsp_names[code] = mapping.fsp_name if mapping else display
            if code_of(fsp_names[code]) != code:
                create(FspMapping, user, fsp_name=fsp_names[code], fsp_code=code, json_ext=tagged())

        reusable = {}
        for account in PaymentAccount.objects.filter(
                is_deleted=False, is_primary=True, fsp_type='MOBILE', verification_status=1,
                pre_audit_status='PASSED'):
            code = code_of(account.fsp_name)
            if code in wanted and is_valid(account.account_number):
                reusable[account.group_beneficiary_id] = (account, code)
        primaries = {}
        for group_id in PaymentAccount.objects.filter(is_deleted=False, is_primary=True) \
                .values_list('group_beneficiary__group_id', flat=True):
            primaries[group_id] = primaries.get(group_id, 0) + 1

        reused_by_mno = {code: [] for code in wanted}
        fresh = []
        beneficiaries = (GroupBeneficiary.objects.filter(
            is_deleted=False, status='ACTIVE', benefit_plan_id=pct_plan.benefit_plan_id)
            .select_related('group').order_by('?'))
        needed = len(slots)
        for gb in beneficiaries.iterator():
            if sum(len(v) for v in reused_by_mno.values()) + len(fresh) >= needed:
                break
            if not HHID_RE.match(gb.group.code or ''):
                continue
            reuse = reusable.get(gb.id)
            if primaries.get(gb.group_id, 0) != (1 if reuse else 0):
                continue
            if reuse and len(reused_by_mno[reuse[1]]) >= wanted[reuse[1]]:
                continue
            members = list(GroupIndividual.objects.filter(group_id=gb.group_id, is_deleted=False)
                           .select_related('individual'))
            head = next((m for m in members if str(m.role or '').upper() == 'HEAD'), None) or \
                (members[0] if members else None)
            # A head in two households can be paired with the other household's account.
            if not head or GroupIndividual.objects.filter(individual_id=head.individual_id,
                                                          is_deleted=False).count() != 1:
                continue
            if reuse:
                reused_by_mno[reuse[1]].append((gb, head))
            elif len(fresh) < needed:
                fresh.append((gb, head))

        assigned = {}  # slot -> (gb, head)
        taken_numbers = set(PaymentAccount.objects.filter(is_deleted=False, fsp_type='MOBILE')
                            .values_list('account_number', flat=True))
        accounts_created = 0
        for slot, (index, mno) in enumerate(slots):
            if reused_by_mno[mno]:
                assigned[slot] = reused_by_mno[mno].pop()
                continue
            if not fresh:
                print(f'Only {len(assigned)} usable PCT households (need {needed}); lower SEED_PER_PAYLIST.')
                transaction.set_rollback(True)
                return
            gb, head = fresh.pop()
            person = head.individual
            holder = f"{person.first_name or ''} {person.last_name or ''}".strip().upper() or 'DEMO RECIPIENT'
            holder = ''.join(c for c in holder if c.isalnum() or c in " .,/-'")[:150]
            number = None
            while number is None or number in taken_numbers:
                number = '255' + RNG.choice(MNOS[mno][1]) + f'{RNG.randint(0, 10**7 - 1):07d}'
            taken_numbers.add(number)
            create(PaymentAccount, user, group_beneficiary=gb, fsp_type='MOBILE', fsp_name=fsp_names[mno],
                   account_number=number, account_name=holder, verification_status=1,
                   pre_audit_status='PASSED', active_check_status='ACTIVE', is_primary=True,
                   json_ext=tagged())
            accounts_created += 1
            assigned[slot] = (gb, head)

        cycle = create(PaymentCycle, user, code=CYCLE_CODE, start_date=date(2026, 10, 1),
                       end_date=date(2026, 10, 31), status='ACTIVE', json_ext=tagged())
        payroll = create(Payroll, user, name=PAYROLL_NAME, payment_plan=pct_plan, payment_cycle=cycle,
                         status='APPROVE_FOR_PAYMENT', payment_method='StrategyMusePayment',
                         date_valid_from=aware(cycle.start_date), date_valid_to=aware(cycle.end_date, 23),
                         json_ext=tagged())
        stamp = timezone.now().strftime('%d%H%M')
        batches = [set() for _ in PAYLISTS]
        for slot, (index, mno) in enumerate(slots):
            gb, head = assigned[slot]
            benefit = create(BenefitConsumption, user, individual=head.individual,
                             code=f'MNO{stamp}{slot + 1:05d}', amount=Decimal(RNG.choice(AMOUNTS)),
                             type='Cash Transfer', date_due=cycle.end_date, status='ACCEPTED',
                             date_valid_from=aware(cycle.start_date),
                             json_ext=tagged(benefit_plan_code='PCT', beneficiary_group_id=str(gb.group_id)))
            create(PayrollBenefitConsumption, user, payroll=payroll, benefit=benefit, json_ext=tagged())
            batches[index].add(benefit.id)

    original = services.payable_pairs
    created = []
    try:
        for (label, fsp_code, _), batch in zip(PAYLISTS, batches):
            services.payable_pairs = lambda benefits, fsp_type, ids=batch: [
                (b, a) for b, a in original(benefits, fsp_type) if b.id in ids]
            result = services.PaylistService(user)._generate_sync(payroll.id, 'MNO', cycle.id, 'MUSE', fsp_code)
            if not result.get('success'):
                print(f'Generation of {label} failed:', result.get('error'))
                break
            created += [(label, p['paylist_uuid']) for p in result.get('paylists', [])]
    finally:
        services.payable_pairs = original

    for paylist in Paylist.objects.filter(id__in=[uuid for _, uuid in created]):
        Paylist.objects.filter(id=paylist.id).update(json_ext={**(paylist.json_ext or {}), '_seed': TAG})

    print(f"Seeded '{TAG}': payroll {payroll.id}, {len(slots)} households "
          f"({accounts_created} new mobile accounts, {len(slots) - accounts_created} reused)")
    for label, uuid in created:
        paylist = Paylist.objects.get(id=uuid)
        mix = {}
        for item in paylist.items.select_related('payment_account'):
            code = code_of(item.payment_account.fsp_name)
            mix[code] = mix.get(code, 0) + 1
        mix_text = ', '.join(f'{k} {v}' for k, v in sorted(mix.items()))
        print(f"  /front/tasafPayment/paylist/{paylist.id}  {label:12s} {paylist.items.count()} payees  "
              f"{paylist.status}  {mix_text}")
    missing = [code for code in wanted
               if not FspProfile.objects.filter(is_deleted=False, fsp_code=code).exists()]
    if missing:
        print(f"NOTE: no FSP profile for {', '.join(sorted(missing))} (Charges tab > FSP); the MUSE preview "
              'marks those payees as awaiting MUSE details.')
    print(f'Approve with a login other than {USERNAME}. Remove with SEED_UNDO=1.')


mute_opensearch()
if UNDO:
    undo()
else:
    seed()
