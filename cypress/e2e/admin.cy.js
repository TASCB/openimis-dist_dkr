const path = require('path');

describe('Django admin workflows', () => {
  beforeEach(function () {
    cy.login_admin_interface()
  });

  it('Configuring individual json schema reflects in advanced filters and upload template', function () {
    cy.contains('a', 'Module configurations').click()

    cy.get('table#result_list').then(($table) => {
      const individualLink = $table.find('a:contains("individual")')

      // Delete any existing individual config
      if (individualLink.length) {
        cy.wrap(individualLink).click()
        cy.contains('a.deletelink', 'Delete').click()
        cy.get('input[type="submit"][value*="Yes"]').click()
      }

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
  })
})

