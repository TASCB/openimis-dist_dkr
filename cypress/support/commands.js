Cypress.Commands.add('login', () => {
  cy.visit('/');
  cy.fixture('cred').then((cred) => {
    cy.get('input[type="text"]').type(cred.username)
    cy.get('input[type="password"]').type(cred.password)
    cy.get('button[type="submit"]').click()
    cy.contains('Welcome Admin Admin!')
  })
})

Cypress.Commands.add('login_admin_interface', () => {
  cy.visit('/api/admin');
  cy.fixture('cred').then((cred) => {
    cy.get('input[type="text"]').type(cred.username)
    cy.get('input[type="password"]').type(cred.password)
    cy.get('input[type="submit"]').click()
    cy.contains('Site administration').should('be.visible')
  })
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
