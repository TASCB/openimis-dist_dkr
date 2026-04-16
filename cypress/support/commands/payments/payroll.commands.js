// Select the first available option from a MUI Select by label.
// Used when the exact option value is unknown (e.g. Payment Method list is
// dynamically populated by the backend).
function chooseFirstMuiSelectOption(label) {
  cy.contains('label', label)
    .siblings('.MuiInputBase-root')
    .find('[role="button"]')
    .click();
  cy.get('[role="listbox"] li')
    .should('have.length.at.least', 1)
    .first()
    .click();
}

// PaymentPlanPicker renders as a MUI Select (SelectInput) with options
// formatted as "{code} - {name}".  The picker label is "Payment Plan Picker"
// (contributionPlan.paymentPlanPicker.label).
// Search by code alone (unique per run) to avoid full-string matching fragility.
// The picker fetches plans on componentDidMount via Redux; if the SELECT is
// clicked before the RESP action arrives and causes a re-render that closes the
// dropdown, retry by clicking the button again.
function choosePayrollPaymentPlan(code) {
  const openAndPick = (attempt) => {
    cy.contains('label', 'Payment Plan Picker')
      .siblings('.MuiInputBase-root')
      .find('[role="button"]')
      .click();

    // Wait for the listbox to appear.
    cy.get('[role="listbox"]', { timeout: 10000 }).should('exist').then(($lb) => {
      const match = $lb.find(`li:contains("${code}")`);
      if (match.length > 0) {
        cy.wrap(match.first()).click();
      } else if (attempt < 3) {
        // Listbox appeared but target option is missing — may still be loading.
        cy.log(`choosePayrollPaymentPlan attempt ${attempt}: "${code}" not found. Options: ` +
          [...$lb.find('li')].slice(0, 10).map((li) => li.innerText.trim()).join(' | '));
        cy.get('body').type('{esc}');
        // eslint-disable-next-line cypress/no-unnecessary-waiting
        cy.wait(1000);
        openAndPick(attempt + 1);
      } else {
        // Final attempt: use cy.contains for a clean timeout error message.
        cy.contains('[role="listbox"] li', code, { timeout: 10000 }).click();
      }
    });
  };

  openAndPick(1);
}

// PaymentCyclePicker renders as an Autocomplete.  Typing the code triggers the
// GraphQL search which filters by status: ACTIVE, so the cycle must be ACTIVE.
// Option label format: "{code} {startDate} {endDate}".
function choosePayrollPaymentCycle(cycleCode) {
  cy.contains('label', 'Payment Cycle')
    .siblings('.MuiInputBase-root')
    .find('input')
    .click()
    .type(cycleCode, { force: true });

  const optionSelector = '[role="menu"] li, [role="presentation"] li, [role="listbox"] li, li[role="option"]';
  cy.contains(optionSelector, cycleCode, { timeout: 15000 }).click();
}

export function registerPayrollCommands() {
  Cypress.Commands.add('assertPayrollDetailFields', ({
    name,
    status,
    dateValidFrom,
    dateValidTo,
    paymentPlanCode,
  }) => {
    cy.assertMuiInput('Name', name);
    if (status) {
      cy.assertMuiInput('Status', status);
    }
    cy.assertMuiInput('Valid From', dateValidFrom);
    if (dateValidTo) {
      cy.assertMuiInput('Valid To', dateValidTo);
    } else {
      cy.assertMuiInput('Valid To');
    }
    cy.assertMuiInput('Payment Method');
    if (paymentPlanCode) {
      cy.assertMuiAutoComplete('Payment Plan Picker', paymentPlanCode);
    }
  });

  Cypress.Commands.add('openCreatePayroll', () => {
    cy.visit('/front/payrolls');
    cy.contains('Payrolls Found');
    // The create affordance is a Fab button; createButton.tooltip key is absent
    // from payroll translations so the tooltip text is unreliable.
    cy.get('button.MuiFab-root').click();
    cy.url().should('include', '/payrolls/payroll');
  });

  Cypress.Commands.add('fillPayrollForm', ({
    name,
    paymentPlanCode,
    paymentPlanName,
    paymentCycleCode,
    paymentMethod,
    dateValidFrom,
    dateValidTo,
  }) => {
    if (name !== undefined) {
      cy.enterMuiInput('Name', name);
    }
    if (paymentPlanCode) {
      choosePayrollPaymentPlan(paymentPlanCode);
    }
    if (paymentCycleCode) {
      choosePayrollPaymentCycle(paymentCycleCode);
    }
    if (paymentMethod) {
      cy.chooseMuiSelect('Payment Method', paymentMethod);
    } else {
      // Payment methods are fetched dynamically; select the first available one.
      chooseFirstMuiSelectOption('Payment Method');
    }
    if (dateValidFrom) {
      cy.enterDateInput('Valid From', dateValidFrom);
    }
    if (dateValidTo) {
      cy.enterDateInput('Valid To', dateValidTo);
    }
  });

  Cypress.Commands.add('savePayroll', () => {
    // tooltip.save = "Save" (different from payment plan's "Save changes")
    cy.get('[title="Save"] button', { timeout: 15000 })
      .should('not.be.disabled')
      .click();
    // After a successful create the URL changes from /payrolls/payroll to
    // /payrolls/payroll/{uuid} and the form becomes read-only.  The server
    // only redirects to the UUID URL on success, so this assertion confirms
    // the save succeeded.
    cy.url({ timeout: 15000 }).should('match', /\/payrolls\/payroll\/.+/);
  });

  Cypress.Commands.add('createPayroll', ({
    name,
    paymentPlanCode,
    paymentPlanName,
    paymentCycleCode,
    paymentMethod,
    dateValidFrom,
    dateValidTo,
  }) => {
    cy.openCreatePayroll();
    cy.fillPayrollForm({
      name,
      paymentPlanCode,
      paymentPlanName,
      paymentCycleCode,
      paymentMethod,
      dateValidFrom,
      dateValidTo,
    });
    cy.savePayroll();
  });

  Cypress.Commands.add('filterPayrolls', ({ name, status } = {}) => {
    cy.visit('/front/payrolls');
    cy.contains(/\d+ Payrolls Found/, { timeout: 15000 });
    if (name !== undefined) {
      cy.enterMuiInput('Name', name);
    }
    if (status !== undefined) {
      cy.chooseMuiSelect('Status', status);
    }
    cy.contains('button', 'Search').click();
    // Wait for the search results to arrive — the counter re-renders with the
    // filtered count after the API responds.
    cy.contains(/\d+ Payrolls Found/, { timeout: 15000 });
  });

  Cypress.Commands.add('resetPayrollFilters', () => {
    cy.contains('button', 'Reset').click({ force: true });
    cy.contains(/\d+ Payrolls Found/, { timeout: 15000 });
  });

  Cypress.Commands.add('assertPayrollRowVisible', ({ name }) => {
    if (name) {
      cy.contains('table tbody tr', name).should('exist');
    }
  });

  Cypress.Commands.add('assertPayrollRowNotVisible', ({ name }) => {
    if (name) {
      cy.contains('table tbody tr', name).should('not.exist');
    }
  });

  Cypress.Commands.add('openPayrollForViewFromList', (name) => {
    cy.filterPayrolls({ name });
    cy.contains('table tbody tr', name)
      .should('exist')
      .within(() => {
        // Row has two IconButtons: View Details (first) and Delete (last).
        cy.get('button.MuiIconButton-root').first().click({ force: true });
      });
    cy.url().should('match', /\/payrolls\/payroll\/.+/);
  });

  Cypress.Commands.add('deletePayrollFromList', (name) => {
    cy.filterPayrolls({ name });
    cy.get('body').then(($body) => {
      const row = $body.find('table tbody tr').toArray()
        .find((tr) => tr.innerText.includes(name));

      if (!row) {
        Cypress.log({ name: 'deletePayrollFromList', message: `No payroll found matching "${name}"` });
        return;
      }

      cy.wrap(row).within(() => {
        // Delete is the last IconButton; only enabled when status is PENDING_APPROVAL.
        cy.get('button.MuiIconButton-root').last().click({ force: true });
      });
      cy.contains('button', 'Ok').click();
      // Wait for the delete mutation to complete before navigating away.
      cy.url().should('include', '/payrolls');
    });
  });

  // Navigate to the Pending Payrolls page and open the reconciliation summary
  // dialog for a specific payroll.  The dialog is triggered by the
  // "View Reconciliation Summary" button (second action column in the pending list).
  Cypress.Commands.add('openPayrollPendingSummary', (payrollName) => {
    cy.visit('/front/payrollsPending');
    cy.contains('Payrolls Found');
    // Filter by name so the row is visible even when many payrolls have accumulated
    // from previous test runs and the list paginates (default 10 per page).
    cy.enterMuiInput('Name', payrollName);
    cy.contains('button', 'Search').click();
    cy.contains('table tbody tr', payrollName)
      .should('exist')
      .within(() => {
        cy.contains('button', 'View Reconciliation Summary').click();
      });
    // Dialog title: "View Reconciliation Summary: {payrollName}"
    cy.contains('View Reconciliation Summary:').should('be.visible');
  });
}
