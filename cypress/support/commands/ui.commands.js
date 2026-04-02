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

    cy.contains('[role="listbox"] li', value).as('option');
    cy.get('@option').click();
  });

  Cypress.Commands.add('assertMuiInput', (label, value, inputTag = 'input') => {
    cy.contains('label', label)
      .siblings('.MuiInputBase-root')
      .find(inputTag)
      .should('be.visible')
      .and('have.value', value);
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

  Cypress.Commands.add('chooseMuiAutocomplete', (label, value = null) => {
    cy.contains('label', label)
      .siblings('.MuiInputBase-root')
      .find('input')
      .click();

    const optionSelector = '[role="menu"] li, [role="presentation"] li, [role="listbox"] li, li[role="option"]';

    if (value) {
      cy.contains(optionSelector, value).click();
      return;
    }

    cy.get(optionSelector)
      .should('have.length.at.least', 1)
      .first()
      .click();
  });
}
