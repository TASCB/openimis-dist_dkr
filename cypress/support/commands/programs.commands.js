import { getTodayFormatted } from '../helpers/date';

export function registerProgramCommands() {
  Cypress.Commands.add('deleteProject', (projectPath) => {
    cy.visit(projectPath);
    cy.get('button[title="Delete"]').click();
    cy.contains('button', 'Ok').click();

    // Check redirect
    cy.location('pathname').should('not.include', projectPath);

    // Check last journal message
    cy.get('ul.MuiList-root li').first().click();
    cy.contains('Delete project').should('exist');
    cy.contains('Failed to delete').should('not.exist');
  });

  Cypress.Commands.add('createProject', (
    programName,
    projectName,
    activityName,
    regionName,
    districtName,
    targetBeneficiaries,
    workingDays,
  ) => {
    cy.visit('/front/benefitPlans');
    cy.openProgramForEditFromList(programName);
    cy.contains('button', 'Projects').click();
    cy.contains('button', 'Create Project').click();
    cy.contains('h6', 'Project details');

    cy.enterMuiInput('Name', projectName);

    cy.chooseMuiAutocomplete('Activity', activityName);

    cy.chooseMuiAutocomplete('Location', regionName);
    if (districtName) {
      cy.contains('li', districtName).click();
    }

    cy.enterMuiInput('Target Beneficiaries', targetBeneficiaries);

    cy.enterMuiInput('Working Days', workingDays);

    cy.get('[title="Save"] button').click();

    // Wait for creation to complete
    cy.get('ul.MuiList-root li div[role="progressbar"]').should('exist');
    cy.get('ul.MuiList-root li div[role="progressbar"]').should('not.exist');

    // Check last journal message
    cy.get('ul.MuiList-root li').first().click();
    cy.contains(`Create project ${projectName}`).should('exist');
    cy.contains('Failed to create').should('not.exist');
  });

  Cypress.Commands.add('deleteProgram', (programName) => {
    cy.visit('/front/benefitPlans');
    cy.contains('tfoot', 'Rows Per Page').should('be.visible');

    cy.get('body').then(($body) => {
      const programRows = $body.find(`td:contains("${programName}")`).closest('tr');

      if (programRows.length > 0) {
        cy.log(`Found ${programRows.length} program(s) to delete`);

        programRows.each((_, row) => {
          cy.wrap(row).within(() => {
            // Find and click the Delete button in this row
            cy.get('button[title="Delete"]')
              .click({ force: true });
          });

          // Confirm deletion in dialog
          cy.contains('button', 'Ok')
            .should('be.visible')
            .click();

          // Wait for deletion to complete
          cy.get('ul.MuiList-root li div[role="progressbar"]').should('exist');

          // Verify deletion in expanded journal drawer
          cy.get('.MuiDrawer-paperAnchorRight button')
            .first()
            .click();

          cy.get('ul.MuiList-root li')
            .first()
            .should('contain', 'Delete program');
          // .should('contain', `Delete program ${programName}`); //TODO: switch to this after fix

          // Close journal drawer
          cy.get('.MuiDrawer-paperAnchorRight button')
            .first()
            .click();
        });
      } else {
        Cypress.log({
          name: 'deleteProgram',
          message: `No programs found with name "${programName}"`,
        });
      }
    });
  });

  Cypress.Commands.add('createProgram', (programCode, programName, maxBeneficiaries, programType) => {
    cy.visit('/front/benefitPlans');
    cy.get('[title="Create"] button').click();

    cy.enterMuiInput('Code', programCode);

    cy.enterMuiInput('Name', programName);

    cy.contains('label', 'Date from')
      .parent()
      .click();
    cy.contains('button', 'OK')
      .click();

    cy.contains('label', 'Date to')
      .parent()
      .click();
    cy.contains('button', 'OK')
      .click();

    cy.enterMuiInput('Max Beneficiaries', maxBeneficiaries);

    cy.contains('label', 'Type')
      .parent()
      .click();
    cy.contains('li[role="option"]', programType)
      .click();

    cy.get('[title="Save changes"] button').click();

    // Wait for creation to complete
    cy.get('ul.MuiList-root li div[role="progressbar"]').should('exist');
    cy.get('ul.MuiList-root li div[role="progressbar"]').should('not.exist');

    // Check last journal message
    cy.get('ul.MuiList-root li').first().click();
    cy.contains('Create program').should('exist');
    cy.contains('Failed to create').should('not.exist');
  });

  Cypress.Commands.add('openProgramForEditFromList', (programName) => {
    cy.contains('tfoot', 'Rows Per Page');
    // Search by name to ensure the program is visible regardless of pagination
    cy.enterMuiInput('Name', programName);
    cy.contains('button', 'Search').click();
    cy.contains('tfoot', 'Rows Per Page');
    cy.contains('td', programName)
      .parent('tr').within(() => {
        // click on edit button
        cy.get('a.MuiIconButton-root').click();
      });
    cy.assertMuiInput('Name', programName);
  });

  Cypress.Commands.add('checkProgramUpdateCompleted', () => {
    // Wait for update to complete
    cy.get('ul.MuiList-root li div[role="progressbar"]').should('exist');
    cy.get('ul.MuiList-root li div[role="progressbar"]').should('not.exist');

    // Check last journal message
    cy.get('ul.MuiList-root li').first().click();
    cy.contains('Update program').should('exist');
    cy.contains('Failed to update').should('not.exist');
  });

  Cypress.Commands.add(
    'checkProgramFieldValues',
    (
      programCode,
      programName,
      maxBeneficiaries,
      programType,
      institution = '',
      description = '',
    ) => {
      cy.assertMuiInput('Code', programCode);
      cy.assertMuiInput('Name', programName);
      const today = getTodayFormatted();
      cy.assertMuiInput('Date from', today);
      cy.assertMuiInput('Date to', today);
      cy.assertMuiInput('Max Beneficiaries', maxBeneficiaries);
      cy.assertMuiInput('Institution', institution);
      cy.assertMuiInput('Description', description, 'textarea');
    },
  );

  Cypress.Commands.add(
    'checkProgramFieldValuesInListView',
    (programCode, programName, maxBeneficiaries, programType) => {
      cy.contains('tfoot', 'Rows Per Page');
      cy.contains('td', programName).should('exist');
      cy.contains('td', programName)
        .parent('tr').within(() => {
          cy.contains('td', programCode);
          cy.contains('td', programType);
          cy.contains('td', maxBeneficiaries);
          cy.contains('td', new Date().toISOString().substring(0, 10));
        });
    },
  );

  Cypress.Commands.add('configureDefaultEnrollmentCriteria', (
    programName, status, criterionField, criterionFilter, criterionValue,
  ) => {
    cy.visit('/front/benefitPlans');
    cy.openProgramForEditFromList(programName);

    cy.contains('button', 'Beneficiaries').click();
    cy.contains('button', status).click();

    cy.contains(`${status} Beneficiary Enrollment Criteria`);
    cy.contains('button', 'Add Filters').click();

    cy.chooseMuiSelect('Field', criterionField);
    cy.chooseMuiSelect('Confirm Filters', criterionFilter);

    const isValueSelect = /^(True|False)$/.test(criterionValue);
    isValueSelect
      ? cy.chooseMuiSelect('Value', criterionValue)
      : cy.enterMuiInput('Value', criterionValue);

    cy.get('[title="Save changes"] button').click();

    cy.checkProgramUpdateCompleted();
    cy.reload();

    cy.contains('button', 'Beneficiaries').click();
    cy.contains('button', status).click();

    cy.assertMuiSelectValue('Field', criterionField);
    cy.assertMuiSelectValue('Confirm Filters', criterionFilter);
    isValueSelect
      ? cy.assertMuiSelectValue('Value', criterionValue)
      : cy.assertMuiInput('Value', criterionValue);
  });

  Cypress.Commands.add('enrollBeneficiariesIntoProgram', (
    programName,
    programCode,
    status,
    criterionField,
    criterionFilter,
    criterionValue,
    entityName,
  ) => {
    cy.chooseMuiAutocomplete('Program', programName);
    cy.chooseMuiSelect('Status', status.toUpperCase());

    cy.assertMuiSelectValue('Field', criterionField);
    cy.assertMuiSelectValue('Confirm Filters', criterionFilter);
    /^(True|False)$/.test(criterionValue)
      ? cy.assertMuiSelectValue('Value', criterionValue)
      : cy.assertMuiInput('Value', criterionValue);

    cy.contains('button', 'Preview Enrollment Process').click();

    cy.contains('h6', `Number Of Selected ${entityName}`)
      .next('p')
      .invoke('text')
      .then((text) => {
        const num = Number(text.trim());
        cy.wrap(num).as('numEnrolled');
        expect(num).to.be.greaterThan(0);
      });

    cy.contains('button', 'Confirm Enrollment Process').click();

    // confirmation dialog
    cy.contains('h2', 'Confirm Enrollment Process');
    cy.contains('button', 'Ok').click();

    // The enrollment page doesn't trigger journal update correctly
    // so we'd have to reload the page here
    cy.reload();

    // Verify enrollment in expanded journal drawer
    cy.get('.MuiDrawer-paperAnchorRight button')
      .first()
      .click();

    cy.get('ul.MuiList-root li')
      .first()
      .should('contain', 'Enrollment has been confirmed');

    // maker-checker approves enrollment
    cy.ensurePermissiveTaskGroup();
    cy.visit('/front/AllTasks');
    cy.contains('tfoot', 'Rows Per Page');
    cy.get('tr')
      .filter((_, tr) => (
        Cypress.$(tr).find('td:contains("import_valid_items")').length > 0
        && Cypress.$(tr).find('td:contains("RECEIVED")').length > 0
      ))
      .first()
      .within(() => {
        cy.get('td')
          .contains(new RegExp(`^${programCode}\\b`))
          .should('exist');

        cy.get('button[title="View details"]').click();
      });

    cy.contains('Import Valid Items Task');
    cy.chooseMuiAutocomplete('Task Group', 'any');
    cy.get('[title="Save changes"] button').click();

    cy.contains('div', 'Accept All')
      .find('button')
      .click();

    cy.contains('Beneficiary Upload Confirmation');
    cy.contains('button', 'Continue').click();
    cy.contains('div', 'Accept All')
      .find('button').should('be.disabled');

    cy.visit('/front/AllTasks');
    cy.get('tr')
      .filter((_, tr) => (
        Cypress.$(tr).find('td:contains("import_valid_items")').length > 0
        && Cypress.$(tr).find(`td:contains("${programCode}")`).length > 0
      ))
      .first()
      .within(() => {
        cy.contains('td', 'COMPLETED');
      });

    cy.visit('/front/benefitPlans');
    cy.openProgramForEditFromList(programName);
    cy.contains('button', 'Beneficiaries').click();
    cy.contains('button', status).click();

    cy.get('@numEnrolled').then((count) => {
      if (entityName === 'Groups') {
        cy.contains(`${count} Group Beneficiaries`);
      } else {
        cy.contains(`${count} Beneficiaries`);
      }
    });
  });

  Cypress.Commands.add('enrollIndividualBeneficiariesIntoProgram', (
    programName,
    programCode,
    status,
    criterionField,
    criterionFilter,
    criterionValue,
  ) => {
    cy.ensureSufficientIndividuals(100);

    cy.visit('/front/individuals');
    cy.contains('a', 'ENROLLMENT').click();

    cy.enrollBeneficiariesIntoProgram(
      programName, programCode, status,
      criterionField, criterionFilter, criterionValue, 'Individuals',
    );
  });

  Cypress.Commands.add('enrollGroupBeneficiariesIntoProgram', (
    programName,
    programCode,
    status,
    criterionField,
    criterionFilter,
    criterionValue,
  ) => {
    cy.ensureSufficientHouseholds(20);

    cy.visit('/front/groups');
    cy.contains('a', 'ENROLLMENT').click();

    cy.enrollBeneficiariesIntoProgram(
      programName, programCode, status,
      criterionField, criterionFilter, criterionValue, 'Groups',
    );
  });
}
