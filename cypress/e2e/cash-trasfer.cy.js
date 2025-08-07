const getTodayFormatted = () => {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  return `${day}-${month}-${year}`;
};

describe('Cash transfer workflows', () => {
  const testProgramNames = []; 

  beforeEach(function () {
    cy.login()
  });

  afterEach(() => {
    testProgramNames.forEach(name => {
      cy.deleteProgram(name)
    })
  })

  it('Creates and deletes an individual program', function () {
    cy.visit('/front/benefitPlans');
    cy.get('[title="Create"] button').click()

    const programCode = 'E2EICP'
    cy.enterMuiInput('Code', programCode)

    const programName = 'E2E Individual Cash Program'
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

    const maxBeneficiaries = "100"
    cy.enterMuiInput('Max Beneficiaries', maxBeneficiaries)

    cy.contains('label', 'Type')
      .parent()
      .click()
    const programType = "INDIVIDUAL"
    cy.contains('li[role="option"]', programType)
      .click()

    cy.get('[title="Save changes"] button').click()

    // Wait for creation to complete
    cy.get('ul.MuiList-root li div[role="progressbar"]').should('exist')
    cy.get('ul.MuiList-root li div[role="progressbar"]').should('not.exist')

    // Check last journal message
    cy.get('ul.MuiList-root li').first().click()
    cy.contains('Create programme').should('exist')
    cy.contains('Failed to create').should('not.exist')

    // Ensure the created program gets cleaned up later
    testProgramNames.push(programName);

    // Check program field values are persisted
    cy.reload()
    cy.assertMuiInput('Code', programCode)
    cy.assertMuiInput('Name', programName)
    const today = getTodayFormatted()
    cy.assertMuiInput('Date from', today)
    cy.assertMuiInput('Date to', today)
    cy.assertMuiInput('Max Beneficiaries', maxBeneficiaries)

    // Check field values displayed in list view
    cy.visit('/front/benefitPlans');
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
})
