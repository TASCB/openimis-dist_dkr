describe('Payment cycle workflows', () => {
  const getDateOffset = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const cycleData = () => {
    const uniquePart = `${Date.now().toString().slice(-5)}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
    return {
      // Code field max length is not as restrictive as program codes; use a short prefix
      // to keep within any backend limits while still being unique per test run.
      code: `PC${uniquePart}`,
      startDate: getDateOffset(0),
      endDate: getDateOffset(30),
      status: 'PENDING',
    };
  };

  // Payment cycles have no delete action in the UI, so created test records
  // accumulate in the database.  Use unique codes per run to avoid conflicts.

  before(() => {
    // Ensure a task group exists for PaymentCycleService tasks so ACTIVE
    // cycle creation tasks are auto-assigned (ACCEPTED) and can be approved.
    cy.login();
    cy.ensurePaymentCycleTaskGroup();
    cy.logout();
  });

  beforeEach(() => {
    cy.login();
  });

  it('validates required fields before allowing payment cycle creation', () => {
    cy.openCreatePaymentCycle();
    // Payment cycle save tooltip is always "Save changes" (the module has no
    // separate disabled-tooltip translation unlike payment plans).
    cy.get('[title="Save changes"] button')
      .should('be.disabled');
  });

  it('creates a PENDING payment cycle successfully', () => {
    const cycle = cycleData();

    cy.createPaymentCycle(cycle);

    cy.filterPaymentCycles({ code: cycle.code });
    cy.assertPaymentCycleRowVisible({ code: cycle.code });
  });

  it('searches payment cycles by code', () => {
    const targetCycle = cycleData();
    const otherCycle = cycleData();

    cy.createPaymentCycle(targetCycle);
    cy.createPaymentCycle(otherCycle);

    cy.filterPaymentCycles({ code: targetCycle.code });
    cy.assertPaymentCycleRowVisible({ code: targetCycle.code });
    cy.assertPaymentCycleRowNotVisible({ code: otherCycle.code });

    cy.filterPaymentCycles({ code: otherCycle.code });
    cy.assertPaymentCycleRowVisible({ code: otherCycle.code });
    cy.assertPaymentCycleRowNotVisible({ code: targetCycle.code });
  });

  it('views payment cycle details from the list', () => {
    const cycle = cycleData();

    cy.createPaymentCycle(cycle);
    cy.openPaymentCycleForViewFromList(cycle.code);
    cy.assertPaymentCycleDetailFields(cycle);
  });

  it('creates an ACTIVE payment cycle via task approval and verifies all fields', () => {
    const cycle = cycleData();

    // ACTIVE cycles route through the maker-checker task workflow:
    // 1. Save creates a task and shows a notification dialog.
    // 2. Approve the task via All Tasks.
    // 3. After approval the cycle is created as ACTIVE.
    cy.createPaymentCycle({ ...cycle, status: 'ACTIVE', expectTaskDialog: true });
    cy.approveLatestPaymentCycleTask();

    // Verify the cycle now appears in the list.
    cy.filterPaymentCycles({ code: cycle.code });
    cy.assertPaymentCycleRowVisible({ code: cycle.code });

    // Open detail page and verify all fields.
    cy.openPaymentCycleForViewFromList(cycle.code);
    cy.assertPaymentCycleDetailFields({ ...cycle, status: 'ACTIVE' });
  });

  it('creates a SUSPENDED payment cycle', () => {
    const cycle = cycleData();

    cy.createPaymentCycle({ ...cycle, status: 'SUSPENDED' });

    cy.filterPaymentCycles({ code: cycle.code });
    cy.assertPaymentCycleRowVisible({ code: cycle.code });
  });

  it('filters payment cycles by status', () => {
    const pendingCycle = cycleData();
    const suspendedCycle = cycleData();

    cy.createPaymentCycle({ ...pendingCycle, status: 'PENDING' });
    cy.createPaymentCycle({ ...suspendedCycle, status: 'SUSPENDED' });

    // Verify the status filter EXCLUDES cycles with a different status.
    // This is the real test: filtering by PENDING must hide SUSPENDED cycles
    // and vice versa.  The old test filtered by status+code simultaneously,
    // which trivially passed without testing the status filter at all.
    cy.filterPaymentCycles({ status: 'PENDING' });
    cy.assertPaymentCycleRowNotVisible({ code: suspendedCycle.code });

    cy.filterPaymentCycles({ status: 'SUSPENDED' });
    cy.assertPaymentCycleRowNotVisible({ code: pendingCycle.code });
  });

  it('shows read-only fields on the detail page', () => {
    const cycle = cycleData();

    cy.createPaymentCycle(cycle);
    cy.openPaymentCycleForViewFromList(cycle.code);

    cy.assertMuiInputDisabled('Code', cycle.code);
    cy.assertMuiInputDisabled('Start Date', cycle.startDate);
    cy.assertMuiInputDisabled('End Date');
    cy.assertMuiSelectValue('Status', 'PENDING');
  });

  it('blocks save when the code is changed to a duplicate value', () => {
    const existingCycle = cycleData();
    const newCycle = cycleData();

    cy.createPaymentCycle(existingCycle);

    cy.openCreatePaymentCycle();
    cy.fillPaymentCycleForm(newCycle);
    // Save button should be enabled with a unique code.
    cy.get('[title="Save changes"] button').should('not.be.disabled');

    // Change the code to the existing cycle's code.
    cy.enterMuiInput('Code', existingCycle.code);
    // The async code validation should disable save.
    cy.get('[title="Save changes"] button', { timeout: 10000 }).should('be.disabled');
  });

  it('creates a payment cycle and immediately searches for it', () => {
    const cycle = cycleData();

    cy.createPaymentCycle(cycle);

    // Navigate to list and search right away — the cycle should be visible
    // without a page refresh or delay.
    cy.filterPaymentCycles({ code: cycle.code });
    cy.assertPaymentCycleRowVisible({ code: cycle.code });
  });

  it('resets payment cycle filters and restores full list', () => {
    cy.visit('/front/paymentCycles');
    cy.contains(/\d+ Payment Cycle/, { timeout: 15000 });
    // eslint-disable-next-line cypress/no-unnecessary-waiting
    cy.wait(1000);

    cy.enterMuiInput('Code', 'FAKE_CODE');

    cy.resetPaymentCycleFilters();

    cy.contains('label', 'Code')
      .siblings('.MuiInputBase-root')
      .find('input')
      .should('have.value', '');
  });
});
