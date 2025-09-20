import { getProgramTerm, getTimestamp } from '../support/utils';

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
  const treePlantingActivity = `E2E Tree Planting - ${getTimestamp()}`;
  const activities = [
    treePlantingActivity,
    `E2E River Cleaning - ${getTimestamp()}`,
  ];

  before(() => {
    // Disable maker checker
    cy.loginAdminInterface()
    cy.setModuleConfig('social_protection', 'social-protection-config.json')
    cy.createActivities(activities)
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
    let testProjectPaths = []

    before(() => {
      cy.login()
      cy.createProgram(programCode, programName, maxBeneficiaries, programType)
    })

    after(() => {
      testProjectPaths.forEach(projectPath => {
        cy.deleteProject(projectPath)
      })
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

    it('Creates and deletes a project under a given program', function () {
      cy.visit('/front/benefitPlans');
      cy.openProgramForEditFromList(programName)
      cy.contains('button', 'Projects').click()
      cy.contains('button', 'Create Project').click()
      cy.contains('h6', 'Project details')

      const projectName = `E2E Public Works Project - ${getTimestamp()}`
      cy.enterMuiInput('Name', projectName)

      cy.chooseMuiAutocomplete('Activity', treePlantingActivity)

      const regionName = 'R2 Tahida'
      const districtName = 'R2D2 Vida'
      cy.chooseMuiAutocomplete('Location', regionName)
      cy.contains('li', districtName).click()

      const targetBeneficiaries = "50"
      cy.enterMuiInput('Target Beneficiaries', targetBeneficiaries)

      const workingDays = "20"
      cy.enterMuiInput('Working Days', workingDays)

      cy.get('[title="Save"] button').click()

      // Wait for creation to complete
      cy.get('ul.MuiList-root li div[role="progressbar"]').should('exist')
      cy.get('ul.MuiList-root li div[role="progressbar"]').should('not.exist')

      // Check last journal message
      cy.get('ul.MuiList-root li').first().click()
      cy.contains(`Create project ${projectName}`).should('exist')
      cy.contains('Failed to create').should('not.exist')

      // Ensure project is cleaned up after test ends
      cy.url().then((currentUrl) => {
        const path = new URL(currentUrl).pathname;
        testProjectPaths.push(path)
      });

      cy.reload()

      cy.assertMuiInput('Name', projectName)
      cy.assertMuiInput('Activity', treePlantingActivity)
      cy.assertMuiInput('Location', districtName)
      cy.assertMuiInput('Target Beneficiaries', targetBeneficiaries)
      cy.assertMuiInput('Working Days', workingDays)
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
