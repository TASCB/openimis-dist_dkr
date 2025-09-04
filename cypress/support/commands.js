const programTerm = Cypress.env('useSocialProtectionLanguagePack') ? 'programme' : 'benefit plan';

const getTodayFormatted = () => {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  return `${day}-${month}-${year}`;
};

Cypress.Commands.add('login', () => {
  cy.visit('/front');
  cy.fixture('cred').then((cred) => {
    cy.get('input[type="text"]').type(cred.username)
    cy.get('input[type="password"]').type(cred.password)
    cy.get('button[type="submit"]').click()
    cy.contains('Welcome Admin Admin!')
  })
})

Cypress.Commands.add('loginAdminInterface', () => {
  cy.visit('/api/admin');
  cy.fixture('cred').then((cred) => {
    cy.get('input[type="text"]').type(cred.username)
    cy.get('input[type="password"]').type(cred.password)
    cy.get('input[type="submit"]').click()
    cy.contains('Site administration').should('be.visible')
  })
})

Cypress.Commands.add('deleteModuleConfig', (moduleName) => {
  cy.visit('/api/admin/core/moduleconfiguration/');

  cy.get('body').then(($body) => {
    if ($body.text().includes('0 module configurations')) {
      Cypress.log({
        name: 'deleteModuleConfig',
        message: 'No module configurations found, skipping deletion.',
      });
    } else {
      cy.get('table#result_list').then(($table) => {
        const configLink = $table.find(`a:contains("${moduleName}")`);

        if (configLink.length) {
          cy.wrap(configLink).click();
          cy.contains('a.deletelink', 'Delete').click();
          cy.get('input[type="submit"][value*="Yes"]').click();
          cy.contains(`a:contains("${moduleName}")`).should('not.exist');
        } else {
          Cypress.log({
            name: 'deleteModuleConfig',
            message: `Module Configuration named ${moduleName} not found, nothing to delete.`,
          });
        }
      });
    }
  });
});

Cypress.Commands.add('shouldHaveMenuItemsInOrder', (expectedMenuNames) => {
  cy.get('div[role="button"]')
  .filter(':visible')
  .should(($buttons) => {
    expect($buttons).to.have.length(expectedMenuNames.length);

    // Check each sub menu item text and order
    expectedMenuNames.forEach((itemText, index) => {
      expect($buttons.eq(index)).to.contain(itemText);
    });
  });
})

Cypress.Commands.add('deleteActivities', (activityNames) => {
  cy.visit('/api/admin/social_protection/activity/');
  cy.get('body').then(($body) => {
    let checkedAny = false;
    activityNames.forEach(activityName => {
      if ($body.find(`td.field-name:contains("${activityName}")`).length) {
        // Check the checkbox in the same row as the activity name
        cy.contains('td.field-name', activityName)
          .parent('tr')
          .find('input[type="checkbox"]')
          .check();
        checkedAny = true;
      }
    });

    if (!checkedAny) {
      Cypress.log({
        name: 'deleteActivity',
        message: `Activities not found, nothing to delete`,
      });
      return
    }

    // Select the delete action and submit
    cy.get('select[name="action"]').select('delete_selected');
    cy.get('button[type="submit"]').contains('Go').click();

    // Confirm the deletion
    cy.get('input[type="submit"][value*="Yes"]').click()

    // Verify deletion
    activityNames.forEach(activityName => {
      cy.contains('td.field-name', activityName).should('not.exist');
    });
  });
});

Cypress.Commands.add('deleteProgram', (programName) => {
  cy.visit('/front/benefitPlans');
  cy.contains('tfoot', 'Rows Per Page').should('be.visible')

  cy.get('body').then(($body) => {
    const programRows = $body.find(`td:contains("${programName}")`).closest('tr');

    if (programRows.length > 0) {
      cy.log(`Found ${programRows.length} program(s) to delete`);

      programRows.each((_, row) => {
        cy.wrap(row).within(() => {
          // Find and click the Delete button in this row
          cy.get('button[title="Delete"]')
            .click({force: true});
        });

        // Confirm deletion in dialog
        cy.contains('button', 'Ok')
          .should('be.visible')
          .click();

        // Wait for deletion to complete
        cy.get('ul.MuiList-root li div[role="progressbar"]').should('exist')

        // Verify deletion in expanded journal drawer
        cy.get('.MuiDrawer-paperAnchorRight button')
          .first()
          .click();

        cy.get('ul.MuiList-root li')
          .first()
          .should('contain', `Delete ${programTerm}`);
          // .should('contain', `Delete ${programTerm} ${programName}`); //TODO: switch to this after fix

        // Close journal drawer
        cy.get('.MuiDrawer-paperAnchorRight button')
          .first()
          .click();
      });
    } else {
      Cypress.log({
        name: 'deleteProgram',
        message: `No programs found with name "${programName}"`,
      });
    }
  });
});

Cypress.Commands.add('createProgram', (programCode, programName, maxBeneficiaries, programType) => {
  cy.visit('/front/benefitPlans');
  cy.get('[title="Create"] button').click()

  cy.enterMuiInput('Code', programCode)

  cy.enterMuiInput('Name', programName)

  cy.contains('label', 'Date from')
    .parent()
    .click()
  cy.contains('button', 'OK')
    .click()

  cy.contains('label', 'Date to')
    .parent()
    .click()
  cy.contains('button', 'OK')
    .click()

  cy.enterMuiInput('Max Beneficiaries', maxBeneficiaries)

  cy.contains('label', 'Type')
    .parent()
    .click()
  cy.contains('li[role="option"]', programType)
    .click()

  cy.get('[title="Save changes"] button').click()

  // Wait for creation to complete
  cy.get('ul.MuiList-root li div[role="progressbar"]').should('exist')
  cy.get('ul.MuiList-root li div[role="progressbar"]').should('not.exist')

  // Check last journal message
  cy.get('ul.MuiList-root li').first().click()
  cy.contains(`Create ${programTerm}`).should('exist')
  cy.contains('Failed to create').should('not.exist')
})

Cypress.Commands.add(
  'checkProgramFieldValues', 
  (
    programCode,
    programName,
    maxBeneficiaries,
    programType,
    institution='',
    description='',
  ) => {
  cy.assertMuiInput('Code', programCode)
  cy.assertMuiInput('Name', programName)
  const today = getTodayFormatted()
  cy.assertMuiInput('Date from', today)
  cy.assertMuiInput('Date to', today)
  cy.assertMuiInput('Max Beneficiaries', maxBeneficiaries)
  cy.assertMuiInput('Institution', institution)
  cy.assertMuiInput('Description', description, 'textarea')
})

Cypress.Commands.add(
  'checkProgramFieldValuesInListView',
  (programCode, programName, maxBeneficiaries, programType) => {

  cy.contains('tfoot', 'Rows Per Page')
  cy.contains('td', programName).should('exist')
  cy.contains('td', programName)
    .parent('tr').within(() => {
      cy.contains('td', programCode)
      cy.contains('td', programType)
      cy.contains('td', maxBeneficiaries)
      cy.contains('td', new Date().toISOString().substring(0, 10))
    })
})

Cypress.Commands.add('enterMuiInput', (label, value, inputTag='input') => {
  cy.contains('label', label)
    .siblings('.MuiInputBase-root')
    .find(inputTag)
    .first()
    .clear({force: true})
    .type(value, {force: true});
})

Cypress.Commands.add('assertMuiInput', (label, value, inputTag='input') => {
  cy.contains('label', label)
    .siblings('.MuiInputBase-root')
    .find(inputTag)
    .should('be.visible')
    .and('have.value', value);
})

Cypress.Commands.add('setModuleConfig', (moduleName, configFixtureFile) => {
    cy.deleteModuleConfig(moduleName)

    cy.contains('a', 'Module configurations').click()

    // Create module config using fixture config file
    cy.contains('a', 'Add module configuration').click()
    cy.get('input[name="module"]').type(moduleName)
    cy.get('select[name="layer"]').select('backend')
    cy.get('input[name="version"]').type(1)

    cy.fixture(configFixtureFile).then((config) => {
      const configString = JSON.stringify(config, null, 2);
      cy.get('textarea[name="config"]')
        .type(configString, {
          parseSpecialCharSequences: false,
          delay: 0  // Type faster
        });

      cy.get('input[value="Save"]').click()
      cy.contains("was added successfully")
    })
})
