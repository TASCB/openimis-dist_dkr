import { TIMEOUTS } from '../../constants';

// PaymentPlanPicker renders as a MUI Select (SelectInput) with options
// formatted as "{code} - {name}".  The picker fetches plans on
// componentDidMount via Redux; if the SELECT is clicked before the RESP
// action arrives and causes a re-render that closes the dropdown, we retry.
//
// NOTE(decision): we tried `cy.chooseMuiSelect('Payment Plan Picker', code)`
// to piggy-back on the generic helper, but the listbox re-render closes the
// dropdown between `.click()` and `cy.contains()` which surfaces as
// intermittent timeouts in CI.  The retry loop below handles that case
// explicitly.  If the underlying data-fetch timing ever changes, revisit.
function choosePayrollPaymentPlan(code) {
  const openAndPick = (attempt) => {
    cy.contains('label', 'Payment Plan Picker')
      .siblings('.MuiInputBase-root')
      .find('[role="button"]')
      .click();

    cy.get('[role="listbox"]', { timeout: 10000 }).should('exist').then(($lb) => {
      const match = $lb.find(`li:contains("${code}")`);
      if (match.length > 0) {
        cy.wrap(match.first()).click();
      } else if (attempt < 3) {
        cy.log(`choosePayrollPaymentPlan attempt ${attempt}: "${code}" not found. Options: ` +
          [...$lb.find('li')].slice(0, 10).map((li) => li.innerText.trim()).join(' | '));
        cy.get('body').type('{esc}');
        // eslint-disable-next-line cypress/no-unnecessary-waiting
        cy.wait(1000);
        openAndPick(attempt + 1);
      } else {
        cy.contains('[role="listbox"] li', code, { timeout: 10000 }).click();
      }
    });
  };

  openAndPick(1);
}

export function registerPayrollCommands() {
  Cypress.Commands.add('assertPayrollDetailFields', ({
    name,
    status,
    dateValidFrom,
    dateValidTo,
    paymentPlanCode,
    paymentCycleCode,
    paymentMethod,
    paymentPointName,
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
    if (paymentMethod) {
      cy.assertMuiInput('Payment Method', paymentMethod);
    } else {
      cy.assertMuiInput('Payment Method');
    }
    if (paymentPlanCode) {
      cy.assertMuiAutoComplete('Payment Plan Picker', paymentPlanCode);
    }
    if (paymentCycleCode) {
      cy.assertMuiAutoComplete('Payment Cycle', paymentCycleCode);
    }
    if (paymentPointName) {
      cy.assertMuiAutoComplete('Payment Point', paymentPointName);
    }
  });

  Cypress.Commands.add('openCreatePayroll', () => {
    cy.visit('/front/payrolls');
    cy.contains('Payrolls Found');
    cy.createClick();
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
      cy.chooseMuiSelect('Payment Plan Picker', [paymentPlanCode, paymentPlanName].join(' - '));
    }
    if (paymentCycleCode) {
      // PaymentCyclePicker is an Autocomplete — typing triggers the filtered query.
      cy.chooseMuiAutocomplete('Payment Cycle', paymentCycleCode);
    }
    if (paymentMethod) {
      cy.chooseMuiSelect('Payment Method', paymentMethod);
    } else {
      // Payment methods are fetched dynamically; select the first available one.
      cy.chooseFirstMuiSelect('Payment Method');
    }
    if (dateValidFrom) {
      cy.enterDateInput('Valid From', dateValidFrom);
    }
    if (dateValidTo) {
      cy.enterDateInput('Valid To', dateValidTo);
    }
  });

  Cypress.Commands.add('savePayroll', () => {
    cy.saveClick();
    // the save actually succeeded.
    cy.url({ timeout: TIMEOUTS.BACKEND_VALIDATION }).should('match', /\/payrolls\/payroll\/.+/);
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

  Cypress.Commands.add('filterPayrolls', ({
    name,
    status,
    paymentPlanCode,
    paymentCycleCode,
    paymentPointName,
    paymentMethod,
    showDeleted = false,
    visitPending = false,
  } = {}) => {
    cy.visit(visitPending ? '/front/payrollsPending' : '/front/payrolls');

    cy.contains(/\d+ Payrolls Found/, { timeout: TIMEOUTS.BACKEND_VALIDATION });

    if (name !== undefined) {
      cy.enterMuiInput('Name', name);
    }
    if (status !== undefined) {
      cy.chooseMuiSelect('Status', status);
    }
    if (paymentPlanCode) {
      cy.chooseMuiSelect('Payment Plan Picker', paymentPlanCode);
    }
    if (paymentCycleCode) {
      cy.chooseMuiAutocomplete('Payment Cycle', paymentCycleCode);
    }
    if (paymentPointName) {
      cy.chooseMuiAutocomplete('Payment Point', paymentPointName);
    }
    if (paymentMethod) {
      cy.chooseMuiSelect('Payment Method', paymentMethod);
    }
    if (showDeleted) {
      cy.toggleMuiCheckbox('Show Deleted', true);
    }

    cy.aliasGraphqlQuery('payroll(', 'payrollSearch');
    cy.contains('button', 'Search').click();
    cy.awaitSearcherRefresh('payrollSearch', /\d+ Payrolls Found/);
  });

  Cypress.Commands.add('resetPayrollFilters', () => {
    cy.aliasGraphqlQuery('payroll(', 'payrollReset');
    cy.resetSearcherFilters(/\d+ Payrolls Found/, 'payrollReset');
  });

  Cypress.Commands.add('assertPayrollRowVisible', ({ name }) => {
    cy.assertTableRowVisible([name]);
  });

  Cypress.Commands.add('assertPayrollRowNotVisible', ({ name }) => {
    cy.assertTableRowNotVisible([name]);
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

  // Full payroll delete flow: maker step (list → Delete → Ok) produces a
  // `payroll_delete` task; checker step assigns the permissive 'any' group.
  // The Ok click must be scoped to the confirmation dialog — an unscoped
  // cy.contains('button', 'Ok') 
  Cypress.Commands.add('deletePayrollFromList', (name) => {
    cy.filterPayrolls({ name });
    cy.openRowActionIfPresent(name, 'Delete').then((found) => {
      if (!found) {
        Cypress.log({ name: 'deletePayrollFromList', message: `No payroll found matching "${name}"` });
        return;
      }
      cy.get('[role="dialog"]', { timeout: 5000 }).should('be.visible');
      cy.get('[role="dialog"]').contains('button', /^(ok|confirm|yes)$/i).click();
      cy.url().should('include', '/payrolls');

      cy.ensurePermissiveTaskGroup();
      // The delete-click produces a `payroll_delete` task that must be
      // approved to finalise the deletion.  The `accept_payroll` task
      // created at payroll creation is separate — approving it just
      // advances the payroll to APPROVE_FOR_PAYMENT, it does NOT delete.
      cy.approveTaskFromList({ containsText: ['payroll_delete', name] });
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
    cy.aliasGraphqlQuery('payroll(', 'pendingPayrollSearch');
    cy.contains('button', 'Search').click();
    cy.awaitSearcherRefresh('pendingPayrollSearch');
    cy.contains('table tbody tr', payrollName)
      .should('exist')
      .within(() => {
        cy.contains('button', 'View Reconciliation Summary').click();
      });
    cy.get('[role="dialog"]', { timeout: TIMEOUTS.BACKEND_VALIDATION })
      .should('be.visible')
      .within(() => {
        cy.contains('View Reconciliation Summary:').should('exist');
        cy.contains(payrollName).should('exist');
      });
  });
}
