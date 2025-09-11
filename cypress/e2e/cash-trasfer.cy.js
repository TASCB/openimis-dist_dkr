import { getProgramTerm } from '../support/utils';

describe('Cash transfer program creation workflows', () => {
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
})

describe('Cash transfer program update workflows', () => {
  before(() => {
    // Disable maker checker
    cy.loginAdminInterface()
    cy.setModuleConfig('social_protection', 'social-protection-config.json')
    cy.logoutAdminInterface()
  })

  describe('Individual program', () => {
    const programCode = 'E2EICPU'
    const programName = 'E2E Individual Cash Program Updated'
    const maxBeneficiaries = "100"
    const programType = "INDIVIDUAL"

    before(() => {
      cy.login()
      cy.createProgram(programCode, programName, maxBeneficiaries, programType)
    })

    after(() => {
      cy.deleteProgram(programName)
    })

    it('Updates an individual program', function () {
      const updatedProgramCode = 'E2EICP42'
      const updatedMaxBeneficiaries = "111"
      const updatedInstitution = "Social Protection Agency"
      const updatedDescription = "Foo bar baz"

      cy.visit('/front/benefitPlans');
      cy.openProgramForEditFromList(programName)

      cy.assertMuiInput('Code', programCode)
      cy.enterMuiInput('Code', updatedProgramCode)
      cy.assertMuiInput('Code', updatedProgramCode)

      cy.enterMuiInput('Max Beneficiaries', updatedMaxBeneficiaries)

      cy.enterMuiInput('Institution', updatedInstitution)

      cy.enterMuiInput('Description', updatedDescription, 'textarea')

      cy.get('[title="Save changes"] button').click()

      cy.checkProgramUpdateCompleted()

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

    it('configures default enrollment criteria for an individual program', function () {
      cy.visit('/front/benefitPlans');
      cy.openProgramForEditFromList(programName)

      cy.contains('button', 'Beneficiaries').click()
      cy.contains('button', 'Potential').click()

      cy.contains('Potential Beneficiary Enrollment Criteria')
      cy.contains('button', 'Add Filters').click()

      cy.chooseMuiSelect('Field', 'Educated level')
      cy.chooseMuiSelect('Confirm Filters', 'Contains')
      cy.enterMuiInput('Value', 'prim')
      cy.get('[title="Save changes"] button').click()

      cy.checkProgramUpdateCompleted()
      cy.reload()

      cy.contains('button', 'Beneficiaries').click()
      cy.contains('button', 'Potential').click()

      cy.assertMuiSelectValue('Field', 'Educated level')
      cy.assertMuiSelectValue('Confirm Filters', 'Contains')
      cy.assertMuiInput('Value', 'prim')
    })
  })

  describe('Household program', () => {
    const programCode = 'E2EGCPU'
    const programName = 'E2E Household Cash Program Updated'
    const maxBeneficiaries = "200"
    const programType = "GROUP"

    before(() => {
      cy.login()
      cy.createProgram(programCode, programName, maxBeneficiaries, programType)
    })

    after(() => {
      cy.deleteProgram(programName)
    })

    it('Updates a household program', function () {
      const updatedProgramCode = 'E2EGCP42'
      const updatedMaxBeneficiaries = "222"
      const updatedInstitution = "Family Support Services"
      const updatedDescription = "A functional program"

      cy.openProgramForEditFromList(programName)

      cy.assertMuiInput('Code', programCode)
      cy.enterMuiInput('Code', updatedProgramCode)
      cy.assertMuiInput('Code', updatedProgramCode)

      cy.enterMuiInput('Max Beneficiaries', updatedMaxBeneficiaries)

      cy.enterMuiInput('Institution', updatedInstitution)

      cy.enterMuiInput('Description', updatedDescription, 'textarea')

      cy.get('[title="Save changes"] button').click()

      cy.checkProgramUpdateCompleted()

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

    it('configures default enrollment criteria for a household program', function () {
      cy.visit('/front/benefitPlans');
      cy.openProgramForEditFromList(programName)

      cy.contains('button', 'Beneficiaries').click()
      cy.contains('button', 'Active').click()

      cy.contains('Active Beneficiary Enrollment Criteria')
      cy.contains('button', 'Add Filters').click()

      cy.chooseMuiSelect('Field', 'Number of children')
      cy.chooseMuiSelect('Confirm Filters', 'Greater than or equal to')
      cy.enterMuiInput('Value', '2')
      cy.get('[title="Save changes"] button').click()

      cy.checkProgramUpdateCompleted()
      cy.reload()

      cy.contains('button', 'Beneficiaries').click()
      cy.contains('button', 'Active').click()

      cy.assertMuiSelectValue('Field', 'Number of children')
      cy.assertMuiSelectValue('Confirm Filters', 'Greater than or equal to')
      cy.assertMuiInput('Value', '2')
    })
  })
})

describe('Individuals and groups/households', () => {
  before(() => {
    // Disable maker checker
    cy.loginAdminInterface()
    cy.setModuleConfig('individual', 'individual-config-minimal.json')
    cy.logoutAdminInterface()
  })

  it('Imports individuals and groups', function () {
    cy.login()
    cy.visit('/front/groups')
    cy.getItemCount('Group').as('initialGroupCount');

    cy.visit('/front/individuals')
    cy.getItemCount('Individual').as('initialIndividualCount');

    cy.uploadIndividualsCSV()

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
