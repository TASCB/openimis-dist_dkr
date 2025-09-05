import { getProgramTerm } from '../support/utils';

describe('Cash transfer workflows', () => {
  let testProgramNames = [];

  beforeEach(function () {
    cy.login()
  });

  afterEach(() => {
    testProgramNames.forEach(name => {
      cy.deleteProgram(name)
    })
    testProgramNames = []
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

  it('Updates an individual program', function () {
    // Disable maker checker
    cy.loginAdminInterface()
    cy.setModuleConfig('social_protection', 'social-protection-config.json')

    const programCode = 'E2EICPU'
    const programName = 'E2E Individual Cash Program Updated'
    const maxBeneficiaries = "100"
    const programType = "INDIVIDUAL"

    cy.createProgram(programCode, programName, maxBeneficiaries, programType)

    // Ensure the created program gets cleaned up later
    testProgramNames.push(programName);

    const updatedProgramCode = 'E2EICP42'
    const updatedMaxBeneficiaries = "111"
    const updatedInstitution = "Social Protection Agency"
    const updatedDescription = "Foo bar baz"

    // Go back into the list page to find the program & edit
    cy.visit('/front/benefitPlans');
    cy.contains('tfoot', 'Rows Per Page')
    cy.contains('td', programName)
      .parent('tr').within(() => {
        // click on edit button
        cy.get('a.MuiIconButton-root').click()
      })

    cy.assertMuiInput('Code', programCode)
    cy.enterMuiInput('Code', updatedProgramCode)
    cy.assertMuiInput('Code', updatedProgramCode)

    cy.enterMuiInput('Max Beneficiaries', updatedMaxBeneficiaries)

    cy.enterMuiInput('Institution', updatedInstitution)

    cy.enterMuiInput('Description', updatedDescription, 'textarea')

    cy.get('[title="Save changes"] button').click()

    // Wait for update to complete
    cy.get('ul.MuiList-root li div[role="progressbar"]').should('exist')
    cy.get('ul.MuiList-root li div[role="progressbar"]').should('not.exist')

    // Check last journal message
    cy.get('ul.MuiList-root li').first().click()
    cy.contains(`Update ${getProgramTerm()}`).should('exist')
    cy.contains('Failed to update').should('not.exist')

    // Check program field values are persisted
    cy.reload()
    cy.checkProgramFieldValues(
      updatedProgramCode,
      programName,
      updatedMaxBeneficiaries,
      programType,
      updatedInstitution,
      updatedDescription,
    )
  })

  it('Creates and deletes an household program', function () {
    const programCode = 'E2EGCP'
    const programName = 'E2E Household Cash Program'
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

  it('Updates a household program', function () {
    // Disable maker checker
    cy.loginAdminInterface()
    cy.setModuleConfig('social_protection', 'social-protection-config.json')

    const programCode = 'E2EGCPU'
    const programName = 'E2E Household Cash Program Updated'
    const maxBeneficiaries = "200"
    const programType = "GROUP"

    cy.createProgram(programCode, programName, maxBeneficiaries, programType)

    // Ensure the created program gets cleaned up later
    testProgramNames.push(programName);

    const updatedProgramCode = 'E2EGCP42'
    const updatedMaxBeneficiaries = "222"
    const updatedInstitution = "Family Support Services"
    const updatedDescription = "A functional program"

    // Go back into the list page to find the program & edit
    cy.visit('/front/benefitPlans');
    cy.contains('tfoot', 'Rows Per Page')
    cy.contains('td', programName)
      .parent('tr').within(() => {
        // click on edit button
        cy.get('a.MuiIconButton-root').click()
      })

    cy.assertMuiInput('Code', programCode)
    cy.enterMuiInput('Code', updatedProgramCode)
    cy.assertMuiInput('Code', updatedProgramCode)

    cy.enterMuiInput('Max Beneficiaries', updatedMaxBeneficiaries)

    cy.enterMuiInput('Institution', updatedInstitution)

    cy.enterMuiInput('Description', updatedDescription, 'textarea')

    cy.get('[title="Save changes"] button').click()

    // Wait for update to complete
    cy.get('ul.MuiList-root li div[role="progressbar"]').should('exist')
    cy.get('ul.MuiList-root li div[role="progressbar"]').should('not.exist')

    // Check last journal message
    cy.get('ul.MuiList-root li').first().click()
    cy.contains(`Update ${getProgramTerm()}`).should('exist')
    cy.contains('Failed to update').should('not.exist')

    // Check program field values are persisted
    cy.reload()
    cy.checkProgramFieldValues(
      updatedProgramCode,
      programName,
      updatedMaxBeneficiaries,
      programType,
      updatedInstitution,
      updatedDescription,
    )
  })

  it('Imports individuals and groups', function () {
    cy.loginAdminInterface()
    cy.setModuleConfig('individual', 'individual-config-minimal.json')

    cy.visit('/front/groups')
    cy.getItemCount('Group').as('initialGroupCount');

    cy.visit('/front/individuals')
    cy.getItemCount('Individual').as('initialIndividualCount');

    cy.contains('li', 'UPLOAD').click()

    cy.get('input[type="file"]').attachFile('individuals.csv');

    cy.chooseMuiSelect('Workflow', 'Python Import Individuals')
    cy.contains('button', 'Upload Individuals').click();

    cy.contains('button', 'Upload Individuals').should('not.exist')

    cy.visit('/front/individuals')
    cy.getItemCount("Individual").then(newCount => {
      cy.get('@initialIndividualCount').then(initial => {
        expect(newCount - initial).to.eq(100);
      });
    });

    cy.visit('/front/groups')
    cy.getItemCount("Group").then(newCount => {
      cy.get('@initialGroupCount').then(initial => {
        expect(newCount - initial).to.eq(20);
      });
    });
  })
})
