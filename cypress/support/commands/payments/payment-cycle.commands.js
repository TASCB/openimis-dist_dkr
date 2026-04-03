function openPaymentCycleRowAction(code) {
  // Each row has a single action: View Details (Eye icon) rendered as
  // <Tooltip title="Details"><IconButton> → <button class="MuiIconButton-root">
  cy.contains('table tbody tr', code)
    .should('exist')
    .within(() => {
      cy.get('button.MuiIconButton-root').click({ force: true });
    });
}

export function registerPaymentCycleCommands() {
  Cypress.Commands.add('openCreatePaymentCycle', () => {
    cy.visit('/front/paymentCycles');
    cy.contains('Payment Cycles');

    // The create affordance is a Fab button (no stable tooltip text in translations).
    cy.get('button.MuiFab-root').click();
    cy.contains('General Information');
  });

  Cypress.Commands.add('fillPaymentCycleForm', ({
    code,
    startDate,
    endDate,
    status,
  }) => {
    if (code !== undefined) {
      cy.enterMuiInput('Code', code);
    }
    if (startDate) {
      cy.enterDateInput('Start Date', startDate);
    }
    if (endDate) {
      cy.enterDateInput('End Date', endDate);
    }
    if (status) {
      cy.chooseMuiSelect('Status', status);
    }
  });

  Cypress.Commands.add('savePaymentCycle', () => {
    // Wait for code validation (async) before the save button becomes enabled.
    cy.get('[title="Save changes"] button', { timeout: 15000 })
      .should('not.be.disabled')
      .click();
    // After a successful create the backend redirects to the detail URL.
    cy.url().should('match', /\/paymentCycles\/paymentCycle\/.+/, { timeout: 15000 });
  });

  Cypress.Commands.add('createPaymentCycle', ({
    code,
    startDate,
    endDate,
    status = 'PENDING',
  }) => {
    cy.openCreatePaymentCycle();
    cy.fillPaymentCycleForm({
      code,
      startDate,
      endDate,
      status,
    });
    cy.savePaymentCycle();
  });

  Cypress.Commands.add('filterPaymentCycles', ({ code, status } = {}) => {
    cy.visit('/front/paymentCycles');
    cy.contains('Payment Cycles');

    if (code !== undefined) {
      cy.enterMuiInput('Code', code);
    }
    if (status !== undefined) {
      cy.chooseMuiSelect('Status', status);
    }

    cy.contains('button', 'Search').click();
    cy.contains('Payment Cycles');
  });

  Cypress.Commands.add('assertPaymentCycleRowVisible', ({ code, status }) => {
    if (code) {
      cy.contains('table tbody tr', code).should('exist');
    }
    if (status) {
      cy.contains('table tbody tr', status).should('exist');
    }
  });

  Cypress.Commands.add('assertPaymentCycleRowNotVisible', ({ code }) => {
    if (code) {
      cy.contains('table tbody tr', code).should('not.exist');
    }
  });

  Cypress.Commands.add('openPaymentCycleForViewFromList', (code) => {
    cy.filterPaymentCycles({ code });
    openPaymentCycleRowAction(code);
    cy.contains('General Information');
  });
}
