// NOTE: remove extra comments

function openPaymentPlanRowAction(nameOrCode, actionTitle) {
  // withTooltip passes the tooltip text to the wrapping <div> as an HTML `title`
  // attribute. Use [title="..."] to reliably find the correct action cell, then
  // click the element inside it.
  //   - Edit            → <div title="Edit"><a class="MuiIconButton-root" href="...">
  //   - Add New Version → <div title="Add New Version"><button class="MuiIconButton-root">
  //   - Delete          → <div title="Delete"><button class="MuiIconButton-root">
  const tag = actionTitle === 'Edit' ? 'a' : 'button';

  cy.contains('table tbody tr', nameOrCode)
    .should('exist')
    .within(() => {
      cy.get(`[title="${actionTitle}"] ${tag}`).click({ force: true });
    });
}

function choosePaymentPlanProgram(programName) {
  // Program names follow the pattern "<prefix> <timestamp>" (4 words).  Using
  // all 4 words as the search term uniquely identifies the run's program and
  // avoids picking up results from previous runs that share the 3-word prefix
  // ("E2E Payroll Program" etc.).  Without the timestamp the result set can
  // exceed the API's page limit and the newly-created program is not visible.
  // Program names follow "<prefix> <label> <timestamp>" patterns.  For names
  // with a 4-word prefix (e.g. "E2E Payment Plan Group <ts>"), using only 4
  // words omits the unique timestamp, matching ALL old programs from previous
  // runs and causing the API to paginate the new one out of view.  5 words
  // captures the timestamp for both "Individual" (4-word) and "Group" (5-word)
  // prefixes.
  const searchTerm = programName.split(' ').slice(0, 5).join(' ');

  cy.contains('label', /Program|Benefit Product|Benefit Plan/, { timeout: 15000 })
    .siblings('.MuiInputBase-root')
    .find('input')
    .click()
    .clear({ force: true })
    .type(searchTerm, { force: true });

  const optionSelector = '[role="menu"] li, [role="presentation"] li, [role="listbox"] li, li[role="option"]';
  cy.contains(optionSelector, programName, { timeout: 15000 }).click();
}

// NOTE: check if this can be moved to a more generic utility file since it's not specific to payment plans also, actionTitle is not being used in the function and can be removed
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
        cy.get('[title="Delete"] button').click({ force: true });
      })
      .then(() => true);
  });
}

function selectPaymentPlanCalculationRule(calculationRule) {
  // NOTE: see if enterMuiInput can be used here instead of directly querying the select input
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

// Fill the criterion row at a given index (0-based).  All rows must already
// exist before this is called (i.e. "Add criterion" was clicked once per row).
// Using .eq(index) rather than .last() is stable when multiple rows are
// present: rows are filled in order 0, 1, … so at the time row i is being
// filled, exactly i rows before it already show their Filter/Value/Amount
// labels, making .eq(i) unambiguous for every label type.
function fillCriterionRow(index, { field, filter, value, amount }) {
  // cy.contains('label', text) returns a SINGLE element — .eq(1) on a
  // one-element set always fails.  Use cy.get().filter() to collect ALL
  // matching labels so .eq(index) can address any row.  Add a length
  // guard so Cypress retries until enough rows are in the DOM.

  // "Field" label is always rendered for every row (unconditional).
  cy.get('label').filter(':contains("Field")')
    .should('have.length.at.least', index + 1)
    .eq(index)
    .siblings('.MuiInputBase-root')
    .find('[role="button"]')
    .click();
  // Field options are loaded asynchronously via fetchCustomFilter after the
  // benefit plan is selected.  Allow extra time for the API response.
  cy.contains('[role="listbox"] li', field, { timeout: 15000 }).click();

  // "Confirm Filters" label appears only after a field is chosen.
  // Because we fill rows sequentially, exactly (index) rows before this one
  // already show their filter label → .eq(index) is the current row's.
  cy.get('label').filter(':contains("Confirm Filters")')
    .should('have.length.at.least', index + 1)
    .eq(index)
    .siblings('.MuiInputBase-root')
    .find('[role="button"]')
    .click();
  cy.contains('[role="listbox"] li', filter).click();

  // "Value" label appears only after a filter is chosen.
  cy.get('label').filter(':contains("Value")')
    .should('have.length.at.least', index + 1)
    .eq(index)
    .siblings('.MuiInputBase-root')
    .find('input')
    .first()
    .clear({ force: true })
    .type(String(value), { force: true });

  if (amount !== undefined && amount !== null) {
    // "Amount" label appears only after a non-empty value is entered.
    cy.get('label').filter(':contains("Amount")')
      .should('have.length.at.least', index + 1)
      .eq(index)
      .siblings('.MuiInputBase-root')
      .find('input')
      .first()
      .clear({ force: true })
      .type(String(amount), { force: true });
  }
}

export function registerPaymentPlanCommands() {
  Cypress.Commands.add('assertPaymentPlanDetailFields', ({
    code,
    name,
    dateValidFrom,
    dateValidTo,
    calculationRule,
    benefitPlanName,
    calculationParams,
  }) => {
    cy.contains('General Information').should('be.visible');
    cy.assertMuiInput('Code', code);
    cy.assertMuiInput('Name', name);
    cy.assertMuiInput('Valid from', dateValidFrom);
    if (dateValidTo) {
      cy.assertMuiInput('Valid to', dateValidTo);
    }
    if (calculationRule) {
      cy.assertMuiSelectValue('Calculation Rule', calculationRule);
    }
    if (benefitPlanName) {
      cy.assertMuiAutoComplete('Program', benefitPlanName);
    }
    if (calculationParams) {
      // NOTE: see if this loop lines can be moved to a function since it is used in multiple places, also the timeout value can be moved to a common config file since it is being used at multiple places
      Object.entries(calculationParams).forEach(([label, value]) => {
        cy.assertMuiInput(label, String(value));
      });
    }
  });

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
    calculationParams,
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
    if (calculationParams) {
      // Wait for the calcrule params section to render (fetched async).
      Object.entries(calculationParams).forEach(([label, value]) => {
        cy.contains('label', label, { timeout: 15000 }).should('be.visible');
        cy.enterMuiInput(label, String(value));
      });
    }
    if (advancedCriteria) {
      const criteriaList = Array.isArray(advancedCriteria) ? advancedCriteria : [advancedCriteria];
      // Add ALL rows first, then fill each one by stable index position.
      // This avoids stale-closure issues in handleAddFilter when rows are
      // added and filled interleaved.
      criteriaList.forEach(() => cy.contains('button', 'Add criterion').click());
      criteriaList.forEach((criterion, index) => fillCriterionRow(index, criterion));
      cy.contains('button', 'Confirm Criteria').click();
    }
  });

  // savePaymentPlan clicks Save and waits for the async mutation journal to
  // complete (progressbar appears then disappears), then opens the drawer.
  // Pass mutationLabel to assert the journal entry text (e.g. 'Update Payment Plan').
  Cypress.Commands.add('savePaymentPlan', (mutationLabel = null) => {
    // NOTE: this save doesn't look any specific to payment plans and can be moved to a common utility file and used in all save operations across the application
    cy.get('[title="Save changes"] button')
      .should('not.be.disabled')
      .click();
    cy.get('ul.MuiList-root li div[role="progressbar"]', { timeout: 15000 }).should('exist');
    cy.get('ul.MuiList-root li div[role="progressbar"]').should('not.exist');
    cy.get('.MuiDrawer-paperAnchorRight button').first().click();
    if (mutationLabel) {
      cy.get('ul.MuiList-root li').first().should('contain', mutationLabel);
    }
  });

  Cypress.Commands.add('createPaymentPlan', ({
    type = 'Benefit Plan',
    code,
    name,
    calculationRule,
    calculationParams,
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
      calculationParams,
      benefitPlanName,
      dateValidFrom,
      dateValidTo,
      advancedCriteria,
    });
    cy.savePaymentPlan('Create Payment Plan');
    // NOTE: this failed to create message can be added as a common assertion after save operation across the application
    cy.get('ul.MuiList-root li').first().should('not.contain', 'Failed to create');
  });

  Cypress.Commands.add('filterPaymentPlans', ({
    code,
    name,
    dateValidFrom,
    dateValidTo,
    showDeleted = false,
    showHistory = false,
  } = {}) => {
    // NOTE: this doesn't support filter based on benefit plan as it is not supported by the UI currently
    cy.visit('/front/paymentPlans');
    cy.contains('Payment Plans Found');

    if (code !== undefined) {
      cy.enterMuiInput('Code', code);
    }
    if (name !== undefined) {
      cy.enterMuiInput('Name', name);
    }
    if (dateValidFrom) {
      cy.enterDateInput('Valid from', dateValidFrom);
    }
    if (dateValidTo) {
      cy.enterDateInput('Valid to', dateValidTo);
    }
    if (showDeleted) {
      // Target the hidden native checkbox by its name attribute (inside MUI Checkbox)
      // NOTE: create a common command for checking unchecking checkboxes by their label text since this is being used in multiple places across the application
      cy.get('input[name="isDeleted"]').check({ force: true });
    }
    if (showHistory) {
      cy.get('input[name="showHistory"]').check({ force: true });
    }

    cy.contains('button', 'Search').click();
    cy.contains('Payment Plans Found');
  });

  // NOTE: this command can be more generic because it can be used to reset filters at multiple places across the application, so move this to a more generic place and then use that command in all places where this command is used
  Cypress.Commands.add('resetPaymentPlanFilters', () => {
    cy.contains('button', 'Reset').click({ force: true });
    cy.contains('Payment Plans Found', { timeout: 15000 });
  });

  // NOTE: this command can be more generic because it can be used to check server status at multiple places across the application, so move this to a more generic place and then use that command in all places where this command is used, consider all the params passed to be checked in a loop for existance
  Cypress.Commands.add('assertPaymentPlanRowVisible', ({ code, name }) => {
    if (code) {
      cy.contains('table tbody tr', code).should('exist');
    }
    if (name) {
      cy.contains('table tbody tr', name).should('exist');
    }
  });

  // NOTE: this function can be moved to a more generic utility file since it is not specific to payment plans, consider all the params passed to be checked in a loop for not existance
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
      // Wait for the delete mutation to complete before navigating away.
      cy.get('ul.MuiList-root li div[role="progressbar"]', { timeout: 15000 }).should('exist');
      cy.get('ul.MuiList-root li div[role="progressbar"]').should('not.exist');
      cy.get('.MuiDrawer-paperAnchorRight button').first().click();
      cy.get('ul.MuiList-root li').first().should('contain', 'Delete Payment Plan');
    });
  });
}
