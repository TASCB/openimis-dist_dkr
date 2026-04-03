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
function choosePayrollPaymentPlan(code, name) {
  cy.contains('label', 'Payment Plan Picker')
    .siblings('.MuiInputBase-root')
    .find('[role="button"]')
    .click();
  cy.contains('[role="listbox"] li', `${code} - ${name}`, { timeout: 15000 }).click();
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
    if (paymentPlanCode && paymentPlanName) {
      choosePayrollPaymentPlan(paymentPlanCode, paymentPlanName);
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
    // /payrolls/payroll/{uuid} and the form becomes read-only.
    cy.url().should('match', /\/payrolls\/payroll\/.+/, { timeout: 15000 });
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

  Cypress.Commands.add('filterPayrolls', ({ name } = {}) => {
    cy.visit('/front/payrolls');
    cy.contains('Payrolls Found');
    if (name !== undefined) {
      cy.enterMuiInput('Name', name);
    }
    cy.contains('button', 'Search').click();
    cy.contains('Payrolls Found');
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
    cy.contains('table tbody tr', name)
      .should('exist')
      .within(() => {
        // Delete is the last IconButton; only enabled when status is PENDING_APPROVAL.
        cy.get('button.MuiIconButton-root').last().click({ force: true });
      });
    cy.contains('button', 'Ok').click();
  });

  // Navigate to the Pending Payrolls page and open the reconciliation summary
  // dialog for a specific payroll.  The dialog is triggered by the
  // "View Reconciliation Summary" button (second action column in the pending list).
  Cypress.Commands.add('openPayrollPendingSummary', (payrollName) => {
    cy.visit('/front/payrollsPending');
    cy.contains('Payrolls Found');
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
