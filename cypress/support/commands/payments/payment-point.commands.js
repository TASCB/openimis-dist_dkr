// Region and District pickers render as AutoSuggestion (MUI Select).
// Municipality and Village render as LocationPicker (MUI Autocomplete).
const LOCATION_SELECT_LABELS = ['Region', 'District'];

function chooseLocationLevel(label, value) {
  if (LOCATION_SELECT_LABELS.includes(label)) {
    cy.chooseMuiSelect(label, value);
  } else {
    cy.chooseMuiAutocomplete(label, value);
  }
}

export function registerPaymentPointCommands() {
  Cypress.Commands.add('assertPaymentPointDetailFields', ({
    name,
    ppm,
  }) => {
    cy.assertMuiInput('Name', name);
    if (ppm) {
      cy.assertMuiAutoComplete('Payment Point Manager', ppm);
    }
  });

  Cypress.Commands.add('openCreatePaymentPoint', () => {
    cy.visit('/front/paymentPoints');
    cy.contains(/\d+ Payment Points Found/, { timeout: 15000 });
    cy.get('button.MuiFab-root').click();
    cy.url().should('include', '/paymentPoints/paymentPoint');
  });

  Cypress.Commands.add('fillPaymentPointForm', ({
    name,
    region,
    district,
    municipality,
    village,
    ppm,
  }) => {
    // Location hierarchy must be filled top-down (cascade).
    if (region) {
      chooseLocationLevel('Region', region);
    }
    if (district) {
      chooseLocationLevel('District', district);
    }
    if (municipality) {
      chooseLocationLevel('Municipality', municipality);
    }
    if (village) {
      chooseLocationLevel('Village', village);
    }
    if (ppm) {
      cy.chooseMuiAutocomplete('Payment Point Manager', ppm);
    }
    if (name !== undefined) {
      cy.enterMuiInput('Name', name);
    }
  });

  Cypress.Commands.add('savePaymentPoint', () => {
    cy.get('button.MuiFab-root:not(.Mui-disabled)', { timeout: 15000 })
      .first()
      .click();
    // After successful save the form redirects to the list page.
    cy.contains(/\d+ Payment Points Found/, { timeout: 15000 });
  });

  Cypress.Commands.add('createPaymentPoint', (data) => {
    cy.openCreatePaymentPoint();
    cy.fillPaymentPointForm(data);
    cy.savePaymentPoint();
  });

  Cypress.Commands.add('filterPaymentPoints', ({
    name,
    ppm,
    region,
    district,
    municipality,
    village,
    showDeleted = false,
  } = {}) => {
    cy.visit('/front/paymentPoints');
    cy.contains(/\d+ Payment Points Found/, { timeout: 15000 });
    // eslint-disable-next-line cypress/no-unnecessary-waiting
    cy.wait(1000);

    if (region) {
      chooseLocationLevel('Region', region);
    }
    if (district) {
      chooseLocationLevel('District', district);
    }
    if (municipality) {
      chooseLocationLevel('Municipality', municipality);
    }
    if (village) {
      chooseLocationLevel('Village', village);
    }
    if (ppm) {
      cy.chooseMuiAutocomplete('Payment Point Manager', ppm);
    }
    if (name !== undefined) {
      cy.enterMuiInput('Name', name);
    }
    if (showDeleted) {
      cy.contains('label', /show deleted/i)
        .find('input[type="checkbox"]')
        .check({ force: true });
    }

    cy.contains('button', 'Search').click();
    cy.contains(/\d+ Payment Points Found/, { timeout: 15000 });
  });

  Cypress.Commands.add('assertPaymentPointRowVisible', ({ name }) => {
    if (name) {
      cy.contains('table tbody tr', name, { timeout: 15000 }).should('exist');
    }
  });

  Cypress.Commands.add('assertPaymentPointRowNotVisible', ({ name }) => {
    if (name) {
      cy.contains('table tbody tr', name).should('not.exist');
    }
  });

  Cypress.Commands.add('openPaymentPointForViewFromList', (name) => {
    cy.filterPaymentPoints({ name });
    cy.contains('table tbody tr', name)
      .should('exist')
      .within(() => {
        // Row has two IconButtons: View Details (first/eye) and Delete (last/trash).
        cy.get('button.MuiIconButton-root').first().click({ force: true });
      });
    cy.url({ timeout: 15000 }).should('include', '/paymentPoints/paymentPoint');
  });

  Cypress.Commands.add('deletePaymentPointFromList', (name) => {
    cy.filterPaymentPoints({ name });
    cy.get('body').then(($body) => {
      const row = $body.find('table tbody tr').toArray()
        .find((tr) => tr.innerText.includes(name));

      if (!row) {
        Cypress.log({
          name: 'deletePaymentPointFromList',
          message: `No payment point found matching "${name}"`,
        });
        return;
      }

      cy.wrap(row).within(() => {
        cy.get('button.MuiIconButton-root').last().click({ force: true });
      });
      cy.contains('button', 'Ok').click();
      cy.url().should('include', '/paymentPoints');
    });
  });

  Cypress.Commands.add('resetPaymentPointFilters', () => {
    cy.contains('button', 'Reset').click({ force: true });
    cy.contains(/\d+ Payment Points Found/, { timeout: 15000 });
  });
}
