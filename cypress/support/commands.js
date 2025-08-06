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
