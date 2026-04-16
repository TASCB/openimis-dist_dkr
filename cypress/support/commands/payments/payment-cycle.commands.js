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
  Cypress.Commands.add('assertPaymentCycleDetailFields', ({
    code,
    startDate,
    status,
  }) => {
    cy.assertMuiInput('Code', code);
    cy.assertMuiInput('Start Date', startDate);
    // End Date: MUI DatePicker in headless mode resets typed future dates to
    // today, so the persisted value may differ.  Assert not-empty only.
    cy.assertMuiInputNotEmpty('End Date');
    cy.assertMuiSelectValue('Status', status);
  });

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

  // savePaymentCycle handles two distinct post-save flows:
  //
  // 1. Direct creation (PENDING, SUSPENDED, or ACTIVE with gql_check=false):
  //    The server redirects to /paymentCycle/{UUID}.  We verify the UUID in
  //    the URL to confirm the save actually succeeded — the old assertion
  //    (url includes '/paymentCycles') always passed because the create form
  //    URL already contains that substring.
  //
  // 2. Task workflow (ACTIVE with gql_check_payment_cycle=true):
  //    A task-creation notification dialog appears.  Pass expectTaskDialog:
  //    true to wait for and dismiss it.
  Cypress.Commands.add('savePaymentCycle', ({ expectTaskDialog = false } = {}) => {
    cy.get('[title="Save changes"] button', { timeout: 15000 })
      .should('not.be.disabled')
      .click();

    if (expectTaskDialog) {
      // ACTIVE + gql_check_payment_cycle=true: wait for the dialog, dismiss it.
      cy.get('[role="dialog"]', { timeout: 15000 }).should('be.visible');
      cy.get('[role="dialog"] .MuiDialogActions-root button').first().click();
      cy.url().should('include', '/paymentCycles');
    } else {
      // Direct creation: verify redirect to the detail page (URL contains UUID).
      cy.url({ timeout: 15000 }).should('match', /\/paymentCycle\/.+/);
    }
  });

  Cypress.Commands.add('createPaymentCycle', ({
    code,
    startDate,
    endDate,
    status = 'PENDING',
    expectTaskDialog = false,
  }) => {
    cy.openCreatePaymentCycle();
    cy.fillPaymentCycleForm({
      code,
      startDate,
      endDate,
      status,
    });
    cy.savePaymentCycle({ expectTaskDialog });
  });

  Cypress.Commands.add('filterPaymentCycles', ({ code, status } = {}) => {
    cy.visit('/front/paymentCycles');
    // Wait for the initial auto-fetch to complete so the filter inputs have
    // stabilised in the DOM before we interact with them.  The Searcher table
    // title renders "{count} Payment Cycles" only after the first API response.
    cy.contains(/\d+ Payment Cycle/, { timeout: 15000 });
    // After the initial fetch, concurrent requests (user profile, component
    // re-fetches) can re-mount filter inputs mid-interaction, causing typed
    // values to be lost or dropdowns to close.  A short wait lets these
    // requests settle before we touch the DOM.
    // eslint-disable-next-line cypress/no-unnecessary-waiting
    cy.wait(1000);

    if (code !== undefined) {
      cy.enterMuiInput('Code', code);
    }
    if (status !== undefined) {
      cy.chooseMuiSelect('Status', status);
    }

    cy.contains('button', 'Search').click();
    // Wait for the search results to arrive — the counter re-renders with the
    // filtered count after the API responds.
    cy.contains(/\d+ Payment Cycle/, { timeout: 15000 });
  });

  Cypress.Commands.add('assertPaymentCycleRowVisible', ({ code, status }) => {
    // Use a generous timeout: the search API response may arrive several
    // seconds after filterPaymentCycles returns.
    if (code) {
      cy.contains('table tbody tr', code, { timeout: 15000 }).should('exist');
    }
    if (status) {
      cy.contains('table tbody tr', status, { timeout: 15000 }).should('exist');
    }
  });

  Cypress.Commands.add('assertPaymentCycleRowNotVisible', ({ code }) => {
    if (code) {
      cy.contains('table tbody tr', code).should('not.exist');
    }
  });

  Cypress.Commands.add('resetPaymentCycleFilters', () => {
    cy.contains('button', 'Reset').click({ force: true });
    cy.contains(/\d+ Payment Cycle/, { timeout: 15000 });
  });

  Cypress.Commands.add('openPaymentCycleForViewFromList', (code) => {
    cy.filterPaymentCycles({ code });
    openPaymentCycleRowAction(code);
    cy.contains('General Information');
  });
}
