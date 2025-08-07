const path = require('path');

describe('Django admin workflows', () => {
  beforeEach(function () {
    cy.loginAdminInterface()
  });

  it('Configuring individual json schema reflects in advanced filters and upload template', function () {
    cy.deleteModuleConfig("individual")

    cy.contains('a', 'Module configurations').click()

    // Create individual config using fixture config file
    cy.contains('a', 'Add module configuration').click()
    cy.get('input[name="module"]').type('individual')
    cy.get('select[name="layer"]').select('backend')
    cy.get('input[name="version"]').type(1)

    cy.fixture('individual-config-minimal.json').then((config) => {
      const configString = JSON.stringify(config, null, 2);
      cy.get('textarea[name="config"]')
        .type(configString, {
          parseSpecialCharSequences: false,
          delay: 0  // Type faster
        });

      cy.get('input[value="Save"]').click()

      cy.visit('/individuals')
      cy.contains('li', 'UPLOAD').click()
      cy.contains('button', 'Template').click()

      const downloadedFilename = path.join(
        Cypress.config('downloadsFolder'),
        'individual_upload_template.csv'
      );
      cy.readFile(downloadedFilename, { timeout: 15000 }).should('exist');

      cy.readFile(downloadedFilename)
        .then(async (text) => {
          expect(text.length).to.be.greaterThan(0);
          expect(text).to.contain('able_bodied');
          expect(text).to.contain('educated_level');
          expect(text).to.contain('number_of_children');
        });

      cy.contains('button', 'Cancel').click()
      cy.contains('button', 'Advanced Filters').click()
      cy.get('div[role="dialog"] div.MuiSelect-select').click()
      cy.contains('li[role="option"]', 'Able bodied')
      cy.contains('li[role="option"]', 'Educated level')
      cy.contains('li[role="option"]', 'Number of children')
    });
  })

  it('Configures project activities', function () {
    const activities = [
      'E2E Tree Planting',
      'E2E River Cleaning',
      'E2E Soil Conservation',
      'E2E Extra',
    ];
    const newName = 'E2E Water Conservation'

    cy.deleteActivities(activities.concat([newName]))

    // Create
    activities.forEach(activityName => {
      cy.contains('a', 'Activities').click()
      cy.contains('a', 'Add Activity').click()
      cy.get('input[name="name"]').type(activityName)
      cy.get('input[value="Save"]').click()
      cy.contains('td.field-name', activityName)
    })

    // Update
    cy.contains('td.field-name', 'E2E Soil Conservation')
      .parent('tr')
      .find('th.field-id a')
      .click();
    cy.get('input[name="name"]').clear().type(newName)
    cy.get('input[value="Save"]').click()
    cy.contains('td.field-name', newName)
      .parent('tr')
      .within(() => {
        cy.get('td.field-name').should('contain', newName);
        cy.get('td.field-version').should('have.text', '2');
      });

    // Soft Delete
    cy.contains('td.field-name', 'E2E Extra')
      .parent('tr')
      .find('th.field-id a')
      .click();
    cy.get('input[name="is_deleted"]').check()
    cy.get('input[value="Save"]').click()
    cy.contains('td.field-name', 'E2E Extra')
      .siblings('td.field-is_deleted')
      .find('img[alt="True"]')
      .should('exist');
  })
})

