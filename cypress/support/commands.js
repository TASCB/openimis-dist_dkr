Cypress.Commands.add('login', () => {
  cy.visit('/');
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
  cy.get('table#result_list').then(($table) => {
    const configLink = $table.find(`a:contains("${moduleName}")`)

    // Delete any existing module config with the given name
    if (configLink.length) {
      cy.wrap(configLink).click()
      cy.contains('a.deletelink', 'Delete').click()
      cy.get('input[type="submit"][value*="Yes"]').click()
      cy.contains(`a:contains("${moduleName}")`).should('not.exist')
    } else {
      Cypress.log({
        name: 'deleteModuleConfig',
        message: `Module Configuration named ${moduleName} not found, nothing to delete`,
      });
    }
  })
})

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
  cy.contains('tfoot', 'Rows Per Page')

  cy.get('body').then(($body) => {
    const programRows = $body.find(`td:contains("${programName}")`).closest('tr');

    if (programRows.length > 0) {
      cy.log(`Found ${programRows.length} program(s) to delete`);

      programRows.each((_, row) => {
        cy.wrap(row).within(() => {
          // Find and click the Delete button in this row
          cy.get('button[title="Delete"]')
            .click();
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
          .should('contain', `Delete programme`);
          // .should('contain', `Delete programme ${programName}`); //TODO: switch to this after fix
      });
    } else {
      Cypress.log({
        name: 'deleteProgram',
        message: `No programs found with name "${programName}"`,
      });
    }
  });
});

Cypress.Commands.add('enterMuiInput', (label, value) => {
  cy.contains('label', label)
    .siblings('.MuiInputBase-root')
    .find('input')
    .type(value);
})

Cypress.Commands.add('assertMuiInput', (label, value) => {
  cy.contains('label', label)
    .siblings('.MuiInputBase-root')
    .find('input')
    .should('be.visible')
    .and('have.value', value);
})
