export function registerUiCommands() {
  Cypress.Commands.add('enterMuiInput', (label, value, inputTag = 'input') => {
    cy.contains('label', label)
      .siblings('.MuiInputBase-root')
      .find(inputTag)
      .first()
      .clear({ force: true })
      .type(value, { force: true });
  });

  Cypress.Commands.add('chooseMuiSelect', (label, value) => {
    cy.contains('label', label)
      .siblings('.MuiInputBase-root')
      .find('[role="button"]')
      .click();

    // Use force:true to skip actionability wait — MUI listbox options can
    // disappear before Cypress finishes its actionability checks.
    cy.contains('[role="listbox"] li', value).click({ force: true });
  });

  Cypress.Commands.add('assertMuiInput', (label, value, inputTag = 'input') => {
    const input = cy.contains('label', label)
      .siblings('.MuiInputBase-root')
      .find(inputTag)
      .should('be.visible');
    if (value !== undefined) {
      input.and('have.value', value);
    }
  });

  Cypress.Commands.add('assertMuiInputNotEmpty', (label, inputTag = 'input') => {
    cy.contains('label', label)
      .siblings('.MuiInputBase-root')
      .find(inputTag)
      .should('be.visible')
      .invoke('val')
      .should('not.be.empty');
  });

  Cypress.Commands.add('assertMuiAutoComplete', (label, value) => {
    cy.contains('label', label)
      .siblings('.MuiInputBase-root')
      .find('input')
      .should('be.visible')
      .invoke('val')
      .should('include', value);
  });

  Cypress.Commands.add('assertMuiInputDisabled', (label, value = null, inputTag = 'input') => {
    const input = cy.contains('label', label)
      .siblings('.MuiInputBase-root')
      .find(inputTag);
    input.should('be.disabled');

    if (value) {
      input.should('have.value', value);
    }
  });

  Cypress.Commands.add('assertMuiSelectValue', (label, value) => {
    cy.contains('label', label)
      .siblings('.MuiInputBase-root')
      .contains(value);
  });

  // Use this instead of enterMuiInput for MUI DatePicker fields.
  // DatePicker opens a modal dialog when interacted with; this command types
  // the value and then confirms the dialog so it doesn't block subsequent actions.
  // TODO: if we end up with more date inputs, it may be worth creating a more robust custom command that can handle the DatePicker's unique structure instead of relying on enterMuiInput + "OK" click.
  Cypress.Commands.add('enterDateInput', (label, value) => {
    cy.enterMuiInput(label, value);
    cy.contains('button', 'OK').click();
  });

  Cypress.Commands.add('chooseMuiAutocomplete', (label, value = null) => {
    const input = cy.contains('label', label)
      .siblings('.MuiInputBase-root')
      .find('input');

    if (value) {
      // Type to trigger lazy-loaded search before selecting the matching option.
      input.click().clear({ force: true }).type(value, { force: true });
    } else {
      input.click();
    }

    const optionSelector = '[role="menu"] li, [role="presentation"] li, [role="listbox"] li, li[role="option"]';

    if (value) {
      cy.contains(optionSelector, value, { timeout: 15000 }).click();
      return;
    }

    cy.get(optionSelector)
      .should('have.length.at.least', 1)
      .first()
      .click();
  });
}
