
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
    const programCode = 'E2EICP'
    const programName = 'E2E Individual Cash Program'
    const maxBeneficiaries = "100"
    const programType = "INDIVIDUAL"

    cy.createProgram(programCode, programName, maxBeneficiaries, programType)

    // Ensure the created program gets cleaned up later
    testProgramNames.push(programName);

    // Check program field values are persisted
    cy.reload()
    cy.checkProgramFieldValues(programCode, programName, maxBeneficiaries, programType)

    // Check field values displayed in list view
    cy.visit('/front/benefitPlans');
    cy.checkProgramFieldValuesInListView(programCode, programName, maxBeneficiaries, programType)
  })

  it('Creates and deletes an household program', function () {
    const programCode = 'E2EGCP'
    const programName = 'E2E Group Cash Program'
    const maxBeneficiaries = "200"
    const programType = "GROUP"

    cy.createProgram(programCode, programName, maxBeneficiaries, programType)

    // Ensure the created program gets cleaned up later
    testProgramNames.push(programName);

    // Check program field values are persisted
    cy.reload()
    cy.checkProgramFieldValues(programCode, programName, maxBeneficiaries, programType)

    // Check field values displayed in list view
    cy.visit('/front/benefitPlans');
    cy.checkProgramFieldValuesInListView(programCode, programName, maxBeneficiaries, programType)
  })
})
