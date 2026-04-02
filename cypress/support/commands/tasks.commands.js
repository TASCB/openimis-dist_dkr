export function registerTaskCommands() {
  Cypress.Commands.add('ensurePermissiveTaskGroup', () => {
    cy.visit('/front/tasks/groups');

    cy.contains('Task Groups Found');
    cy.get('table').then(($table) => {
      const hasAnyRow = $table.find('tbody tr td:first-child')
        .toArray()
        .some((td) => td.innerText.trim() === 'any');

      if (!hasAnyRow) {
        cy.get('[title="Create"] button').click();

        cy.enterMuiInput('Code', 'any');
        cy.chooseMuiSelect('Policy Status', 'ANY');
        cy.chooseMuiAutocomplete('Task Executors', 'Admin Admin');

        cy.get('[title="Save changes"] button').click();

        // Wait for creation to complete
        cy.get('ul.MuiList-root li div[role="progressbar"]').should('exist');

        // Verify creation in expanded journal drawer
        cy.get('.MuiDrawer-paperAnchorRight button').first().click();

        cy.get('ul.MuiList-root li').first().should('contain', 'Create task group');
      } else {
        cy.log('Permissive task group named any already exists — skipping creation.');
      }
    });
  });
}
