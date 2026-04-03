function openPaymentPlanRowAction(nameOrCode, actionTitle) {
  // MUI Tooltip does NOT set an HTML `title` attribute on its child, so selectors
  // like `[title="Edit"] button` do not work. Instead we rely on the DOM structure:
  //   - Edit    → rendered as <a class="MuiIconButton-root"> (has `href`)
  //   - Add New Version → first <button class="MuiIconButton-root"> in the row
  //   - Delete  → last  <button class="MuiIconButton-root"> in the row
  const getActionElement = () => {
    if (actionTitle === 'Edit') return cy.get('a.MuiIconButton-root');
    if (actionTitle === 'Add New Version') return cy.get('button.MuiIconButton-root').first();
    return cy.get('button.MuiIconButton-root').last();
  };

  cy.contains('table tbody tr', nameOrCode)
    .should('exist')
    .within(() => {
      getActionElement().click({ force: true });
    });
}

function choosePaymentPlanProgram(programName) {
  // MUI appends a required-field marker ("*") as a child span inside the label element.
  // Type the program name to trigger an API search (so newly-created programs appear)
  // rather than relying on the default dropdown which may show a cached result set.
  cy.contains('label', /Program|Benefit Product|Benefit Plan/, { timeout: 15000 })
    .siblings('.MuiInputBase-root')
    .find('input')
    .click()
    .type(programName, { force: true });

  const optionSelector = '[role="menu"] li, [role="presentation"] li, [role="listbox"] li, li[role="option"]';
  cy.contains(optionSelector, programName, { timeout: 15000 }).click();
}

function openRowActionIfPresent(nameOrCode, actionTitle) {
  return cy.get('body').then(($body) => {
    const row = $body.find('table tbody tr').toArray()
      .find((tr) => tr.innerText.includes(nameOrCode));

    if (!row) {
      return false;
    }

    // Return a Cypress chain so the async click completes before the outer
    // `.then((found) => ...)` resolves.  Delete is always the last button
    // (Add New Version is first; Edit is an anchor, not a button).
    return cy.wrap(row)
      .within(() => {
        cy.get('button.MuiIconButton-root').last().click({ force: true });
      })
      .then(() => true);
  });
}

function selectPaymentPlanCalculationRule(calculationRule) {
  cy.contains('label', 'Calculation Rule')
    .siblings('.MuiInputBase-root')
    .find('[role="button"]')
    .click();

  if (calculationRule) {
    cy.contains('[role="listbox"] li', calculationRule).click();
    return;
  }

  cy.get('[role="listbox"] li')
    .should('have.length.at.least', 1)
    .first()
    .click();
}

function applyAdvancedCriterion({
  field,
  filter,
  value,
  amount,
}) {
  cy.contains('button', 'Add criterion').click();

  cy.contains('label', 'Field')
    .last()
    .siblings('.MuiInputBase-root')
    .find('[role="button"]')
    .click();
  // The Field options are loaded asynchronously via fetchCustomFilter after the
  // benefit plan is selected.  Allow extra time for the API response to arrive.
  cy.contains('[role="listbox"] li', field, { timeout: 15000 }).click();

  cy.contains('label', 'Confirm Filters')
    .last()
    .siblings('.MuiInputBase-root')
    .find('[role="button"]')
    .click();
  cy.contains('[role="listbox"] li', filter).click();

  cy.contains('label', 'Value')
    .last()
    .siblings('.MuiInputBase-root')
    .find('input')
    .first()
    .clear({ force: true })
    .type(String(value), { force: true });

  if (amount !== undefined && amount !== null) {
    cy.contains('label', 'Amount')
      .last()
      .siblings('.MuiInputBase-root')
      .find('input')
      .first()
      .clear({ force: true })
      .type(String(amount), { force: true });
  }

  cy.contains('button', 'Confirm Criteria').click();
}

export function registerPaymentPlanCommands() {
  Cypress.Commands.add('openCreatePaymentPlan', () => {
    cy.visit('/front/paymentPlans');
    cy.contains('Payment Plans Found');

    // The create affordance is a floating icon button with tooltip text only.
    cy.get('[title="Create new Payment Plan"] button').click({ force: true });
    cy.contains('General Information');
  });

  Cypress.Commands.add('fillPaymentPlanForm', ({
    type,
    code,
    name,
    calculationRule,
    benefitPlanName,
    dateValidFrom,
    dateValidTo,
    advancedCriteria,
  }) => {
    if (type) {
      cy.chooseMuiSelect('Type', type);
    }
    if (code !== undefined) {
      cy.enterMuiInput('Code', code);
    }
    if (name !== undefined) {
      cy.enterMuiInput('Name', name);
    }
    // undefined → select first available; null → skip (e.g. duplicate-code test); string → select that rule
    if (calculationRule !== null) {
      selectPaymentPlanCalculationRule(calculationRule);
    }
    if (benefitPlanName) {
      choosePaymentPlanProgram(benefitPlanName);
    }
    if (dateValidFrom) {
      cy.enterDateInput('Valid from', dateValidFrom);
    }
    if (dateValidTo) {
      cy.enterDateInput('Valid to', dateValidTo);
    }
    if (advancedCriteria) {
      applyAdvancedCriterion(advancedCriteria);
    }
  });

  Cypress.Commands.add('savePaymentPlan', () => {
    cy.get('[title="Save changes"] button')
      .should('not.be.disabled')
      .click();
  });

  Cypress.Commands.add('createPaymentPlan', ({
    type = 'Benefit Plan',
    code,
    name,
    calculationRule,
    benefitPlanName,
    dateValidFrom,
    dateValidTo,
    advancedCriteria,
  }) => {
    cy.openCreatePaymentPlan();
    cy.fillPaymentPlanForm({
      type,
      code,
      name,
      calculationRule,
      benefitPlanName,
      dateValidFrom,
      dateValidTo,
      advancedCriteria,
    });
    cy.savePaymentPlan();
    // Wait for the async create to complete via the journal progress indicator
    cy.get('ul.MuiList-root li div[role="progressbar"]', { timeout: 15000 }).should('exist');
    cy.get('ul.MuiList-root li div[role="progressbar"]').should('not.exist');
    cy.get('.MuiDrawer-paperAnchorRight button').first().click();
    cy.get('ul.MuiList-root li').first().should('contain', 'Create Payment Plan');
    cy.get('ul.MuiList-root li').first().should('not.contain', 'Failed to create');
  });

  Cypress.Commands.add('filterPaymentPlans', ({
    code,
    name,
    benefitPlan,
    showDeleted = false,
    showHistory = false,
  } = {}) => {
    cy.visit('/front/paymentPlans');
    cy.contains('Payment Plans Found');

    if (code !== undefined) {
      cy.enterMuiInput('Code', code);
    }
    if (name !== undefined) {
      cy.enterMuiInput('Name', name);
    }
    if (benefitPlan !== undefined) {
      // The Benefit Product filter is a ProductPicker autocomplete.
      cy.chooseMuiAutocomplete('Benefit Product', benefitPlan);
    }
    if (showDeleted) {
      cy.contains('label', 'Show Deleted').click();
    }
    if (showHistory) {
      cy.contains('label', 'Show History').click();
    }

    cy.contains('button', 'Search').click();
    cy.contains('Payment Plans Found');
  });

  Cypress.Commands.add('assertPaymentPlanRowVisible', ({ code, name }) => {
    if (code) {
      cy.contains('table tbody tr', code).should('exist');
    }
    if (name) {
      cy.contains('table tbody tr', name).should('exist');
    }
  });

  Cypress.Commands.add('assertPaymentPlanRowNotVisible', ({ code, name }) => {
    if (code) {
      cy.contains('table tbody tr', code).should('not.exist');
    }
    if (name) {
      cy.contains('table tbody tr', name).should('not.exist');
    }
  });

  Cypress.Commands.add('openPaymentPlanForEditFromList', (nameOrCode) => {
    cy.filterPaymentPlans({ code: nameOrCode });
    openPaymentPlanRowAction(nameOrCode, 'Edit');
    cy.contains('General Information');
  });

  Cypress.Commands.add('replacePaymentPlanFromList', (nameOrCode) => {
    cy.filterPaymentPlans({ code: nameOrCode });
    openPaymentPlanRowAction(nameOrCode, 'Add New Version');
    cy.contains('General Information');
  });

  Cypress.Commands.add('deletePaymentPlan', (nameOrCode, options = {}) => {
    cy.filterPaymentPlans({
      code: options.useCodeFilter ? nameOrCode : undefined,
      name: options.useCodeFilter ? undefined : nameOrCode,
      showDeleted: options.showDeleted,
      showHistory: options.showHistory,
    });

    openRowActionIfPresent(nameOrCode, 'Delete').then((found) => {
      if (!found) {
        Cypress.log({
          name: 'deletePaymentPlan',
          message: `No payment plan found matching "${nameOrCode}"`,
        });
        return;
      }

      cy.contains('button', 'Ok').click();
      cy.get('.MuiDrawer-paperAnchorRight button').first().click();
      cy.get('ul.MuiList-root li').first().should('contain', 'Delete Payment Plan');
    });
  });
}
