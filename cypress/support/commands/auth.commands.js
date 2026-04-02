export function registerAuthCommands() {
  Cypress.Commands.add('login', () => {
    cy.visit('/front');

    cy.get('body', { timeout: 15000 }).then(($body) => {
      const hasLogoutButton = $body.find('button[title="Log out"]').length > 0;
      if (hasLogoutButton) {
        return;
      }

      cy.fixture('cred').then((cred) => {
        cy.visit('/front/login');
        cy.get('input[type="text"]', { timeout: 15000 }).first().clear().type(cred.username);
        cy.get('input[type="password"]', { timeout: 15000 }).first().clear().type(cred.password);
        cy.get('button[type="submit"]').click();
        cy.url({ timeout: 15000 }).should('not.include', '/front/login');
      });
    });

    cy.contains('Welcome Admin Admin!', { timeout: 15000 }).should('be.visible');
  });

  Cypress.Commands.add('logout', () => {
    cy.visit('/front');
    cy.get('button[title="Log out"]').click();
    cy.contains('label', 'Username');
  });

  Cypress.Commands.add('loginAdminInterface', () => {
    cy.visit('/api/admin');
    cy.fixture('cred').then((cred) => {
      cy.get('input[type="text"]').type(cred.username);
      cy.get('input[type="password"]').type(cred.password);
      cy.get('input[type="submit"]').click();
      cy.contains('Site administration').should('be.visible');
    });
  });

  Cypress.Commands.add('logoutAdminInterface', () => {
    cy.visit('/api/admin');
    cy.contains('button', 'Log out').click();
  });
}
