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

  beforeEach(() => {
    cy.login();
  });

  it('validates required fields before allowing payment cycle creation', () => {
    cy.openCreatePaymentCycle();
    cy.get('[title="Please fill General Information fields first"] button')
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
    cy.assertMuiInput('Code', cycle.code);
  });
});
