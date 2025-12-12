import { getProgramTerm } from '../support/utils';

const getTodayFormatted = () => {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  return `${day}-${month}-${year}`;
};

Cypress.Commands.add('login', () => {
  cy.visit('/front');
  cy.fixture('cred').then((cred) => {
    cy.get('input[type="text"]').type(cred.username)
    cy.get('input[type="password"]').type(cred.password)
    cy.get('button[type="submit"]').click()
    cy.contains('Welcome Admin Admin!')
  })
})

Cypress.Commands.add('logout', () => {
  cy.visit('/front');
  cy.get('button[title="Log out"]').click()
  cy.contains('label', 'Username')
})

Cypress.Commands.add('loginAdminInterface', () => {
  cy.visit('/api/admin');
  cy.fixture('cred').then((cred) => {
    cy.get('input[type="text"]').type(cred.username)
    cy.get('input[type="password"]').type(cred.password)
    cy.get('input[type="submit"]').click()
    cy.contains('Site administration').should('be.visible')
  })
})

Cypress.Commands.add('logoutAdminInterface', () => {
  cy.visit('/api/admin');
  cy.contains('button', 'Log out').click()
})

Cypress.Commands.add('deleteModuleConfig', (moduleName) => {
  cy.visit('/api/admin/core/moduleconfiguration/');

  cy.get('body').then(($body) => {
    if ($body.text().includes('0 module configurations')) {
      Cypress.log({
        name: 'deleteModuleConfig',
        message: 'No module configurations found, skipping deletion.',
      });
    } else {
      cy.get('table#result_list').then(($table) => {
        const configLink = $table.find(`a:contains("${moduleName}")`);

        if (configLink.length) {
          cy.wrap(configLink).click();
          cy.contains('a.deletelink', 'Delete').click();
          cy.get('input[type="submit"][value*="Yes"]').click();
          cy.contains(`a:contains("${moduleName}")`).should('not.exist');
        } else {
          Cypress.log({
            name: 'deleteModuleConfig',
            message: `Module Configuration named ${moduleName} not found, nothing to delete.`,
          });
        }
      });
    }
  });
});

Cypress.Commands.add('shouldHaveMenuItemsInOrder', (expectedMenuNames) => {
  cy.get('div[role="button"]')
  .filter(':visible')
  .should(($buttons) => {
    expect($buttons).to.have.length(expectedMenuNames.length);

    // Check each sub menu item text and order
    expectedMenuNames.forEach((itemText, index) => {
      expect($buttons.eq(index)).to.contain(itemText);
    });
  });
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

Cypress.Commands.add('createActivities', (activities) => {
  cy.deleteActivities(activities)

  activities.forEach(activityName => {
    cy.contains('a', 'Activities').click()
    cy.contains('a', 'Add Activity').click()
    cy.get('input[name="name"]').type(activityName)
    cy.get('input[value="Save"]').click()
    cy.contains('td.field-name', activityName)
  })
})

Cypress.Commands.add('deleteProject', (projectPath) => {
  cy.visit(projectPath);
  cy.get('button[title="Delete"]').click();
  cy.contains('button', 'Ok').click();

  // Check redirect
  cy.location('pathname').should('not.include', projectPath);

  // Check last journal message
  cy.get('ul.MuiList-root li').first().click()
  cy.contains(`Delete project`).should('exist')
  cy.contains('Failed to delete').should('not.exist')
})

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
  cy.openProgramForEditFromList(programName)
  cy.contains('button', 'Projects').click()
  cy.contains('button', 'Create Project').click()
  cy.contains('h6', 'Project details')

  cy.enterMuiInput('Name', projectName)

  cy.chooseMuiAutocomplete('Activity', activityName)

  cy.chooseMuiAutocomplete('Location', regionName)
  if (districtName) {
    cy.contains('li', districtName).click()
  }

  cy.enterMuiInput('Target Beneficiaries', targetBeneficiaries)

  cy.enterMuiInput('Working Days', workingDays)

  cy.get('[title="Save"] button').click()

  // Wait for creation to complete
  cy.get('ul.MuiList-root li div[role="progressbar"]').should('exist')
  cy.get('ul.MuiList-root li div[role="progressbar"]').should('not.exist')

  // Check last journal message
  cy.get('ul.MuiList-root li').first().click()
  cy.contains(`Create project ${projectName}`).should('exist')
  cy.contains('Failed to create').should('not.exist')
})

Cypress.Commands.add('deleteProgram', (programName) => {
  cy.visit('/front/benefitPlans');
  cy.contains('tfoot', 'Rows Per Page').should('be.visible')

  cy.get('body').then(($body) => {
    const programRows = $body.find(`td:contains("${programName}")`).closest('tr');

    if (programRows.length > 0) {
      cy.log(`Found ${programRows.length} program(s) to delete`);

      programRows.each((_, row) => {
        cy.wrap(row).within(() => {
          // Find and click the Delete button in this row
          cy.get('button[title="Delete"]')
            .click({force: true});
        });

        // Confirm deletion in dialog
        cy.contains('button', 'Ok')
          .should('be.visible')
          .click();

        // Wait for deletion to complete
        cy.get('ul.MuiList-root li div[role="progressbar"]').should('exist')

        // Verify deletion in expanded journal drawer
        cy.get('.MuiDrawer-paperAnchorRight button')
          .first()
          .click();

        cy.get('ul.MuiList-root li')
          .first()
          .should('contain', `Delete ${getProgramTerm()}`);
          // .should('contain', `Delete ${getProgramTerm()} ${programName}`); //TODO: switch to this after fix

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
  cy.get('[title="Create"] button').click()

  cy.enterMuiInput('Code', programCode)

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

  cy.enterMuiInput('Max Beneficiaries', maxBeneficiaries)

  cy.contains('label', 'Type')
    .parent()
    .click()
  cy.contains('li[role="option"]', programType)
    .click()

  cy.get('[title="Save changes"] button').click()

  // Wait for creation to complete
  cy.get('ul.MuiList-root li div[role="progressbar"]').should('exist')
  cy.get('ul.MuiList-root li div[role="progressbar"]').should('not.exist')

  // Check last journal message
  cy.get('ul.MuiList-root li').first().click()
  cy.contains(`Create ${getProgramTerm()}`).should('exist')
  cy.contains('Failed to create').should('not.exist')
})

Cypress.Commands.add('openProgramForEditFromList', (programName) => {
  cy.contains('tfoot', 'Rows Per Page')
  cy.contains('td', programName)
    .parent('tr').within(() => {
      // click on edit button
      cy.get('a.MuiIconButton-root').click()
    })
  cy.assertMuiInput('Name', programName)
})

Cypress.Commands.add('checkProgramUpdateCompleted', (programName) => {
  // Wait for update to complete
  cy.get('ul.MuiList-root li div[role="progressbar"]').should('exist')
  cy.get('ul.MuiList-root li div[role="progressbar"]').should('not.exist')

  // Check last journal message
  cy.get('ul.MuiList-root li').first().click()
  cy.contains(`Update ${getProgramTerm()}`).should('exist')
  cy.contains('Failed to update').should('not.exist')
})

Cypress.Commands.add(
  'checkProgramFieldValues',
  (
    programCode,
    programName,
    maxBeneficiaries,
    programType,
    institution='',
    description='',
  ) => {
  cy.assertMuiInput('Code', programCode)
  cy.assertMuiInput('Name', programName)
  const today = getTodayFormatted()
  cy.assertMuiInput('Date from', today)
  cy.assertMuiInput('Date to', today)
  cy.assertMuiInput('Max Beneficiaries', maxBeneficiaries)
  cy.assertMuiInput('Institution', institution)
  cy.assertMuiInput('Description', description, 'textarea')
})

Cypress.Commands.add(
  'checkProgramFieldValuesInListView',
  (programCode, programName, maxBeneficiaries, programType) => {

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

Cypress.Commands.add('uploadIndividualsCSV', (numIndividuals) => {
  cy.task('updateCSV', { numIndividuals }).then(() => {
    cy.contains('li', 'UPLOAD').click()

    cy.get('input[type="file"]').attachFile('tmp_individuals.csv');

    cy.chooseMuiSelect('Workflow', 'Python Import Individuals')
    cy.contains('button', 'Upload Individuals').click();

    cy.contains('button', 'Upload Individuals').should('not.exist')
    cy.contains('button', 'Uploading...').should('be.disabled')
  })
})

Cypress.Commands.add('ensureSufficientIndividuals', (expectedNumIndividuals) => {
  cy.visit('/front/individuals')
  cy.getItemCount('Individual').then(count => {
    const numToAdd = expectedNumIndividuals - count;
    if (numToAdd <= 0) {
      Cypress.log({
        name: 'ensureSufficientIndividuals',
        message: `Found ${count} which is more than ${expectedNumIndividuals}, no need to add additional`,
      });
      return
    }

    cy.visit('/front/individuals')
    cy.uploadIndividualsCSV(numToAdd)

    cy.wait(100*numToAdd) // group creation takes time

    cy.visit('/front/individuals')
    cy.getItemCount("Individual").then(newCount => {
      expect(newCount).to.be.gte(expectedNumIndividuals);
    });
  })
})

Cypress.Commands.add('ensureSufficientHouseholds', (expectedNumGroups) => {
  cy.visit('/front/groups')
  cy.getItemCount('Group').then(numGroups => {
    const numGroupsToAdd = expectedNumGroups - numGroups;
    if (numGroupsToAdd <= 0) {
      Cypress.log({
        name: 'ensureSufficientHouseholds',
        message: `Found ${numGroups} which is more than ${expectedNumGroups}, no need to add additional`,
      });
      return
    }

    const numIndividualsToAdd = numGroupsToAdd * 5
    cy.visit('/front/individuals')
    cy.uploadIndividualsCSV(numIndividualsToAdd)

    cy.wait(100*numIndividualsToAdd) // group creation takes time

    cy.visit('/front/groups')
    cy.getItemCount("Group").then(newCount => {
      expect(newCount).to.be.gte(expectedNumGroups);
    });
  })
})

Cypress.Commands.add('ensurePermissiveTaskGroup', () => {
  cy.visit('/front/tasks/groups');

  cy.contains('Task Groups Found')
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

Cypress.Commands.add('configureDefaultEnrollmentCriteria', (
  programName, status, criterionField, criterionFilter, criterionValue,
) => {
  cy.visit('/front/benefitPlans');
  cy.openProgramForEditFromList(programName)

  cy.contains('button', 'Beneficiaries').click()
  cy.contains('button', status).click()

  cy.contains(`${status} Beneficiary Enrollment Criteria`)
  cy.contains('button', 'Add Filters').click()

  cy.chooseMuiSelect('Field', criterionField)
  cy.chooseMuiSelect('Confirm Filters', criterionFilter)

  const isValueSelect = /^(True|False)$/.test(criterionValue);
  isValueSelect
    ? cy.chooseMuiSelect('Value', criterionValue)
    : cy.enterMuiInput('Value', criterionValue);

  cy.get('[title="Save changes"] button').click()

  cy.checkProgramUpdateCompleted()
  cy.reload()

  cy.contains('button', 'Beneficiaries').click()
  cy.contains('button', status).click()

  cy.assertMuiSelectValue('Field', criterionField);
  cy.assertMuiSelectValue('Confirm Filters', criterionFilter);
  isValueSelect
    ? cy.assertMuiSelectValue('Value', criterionValue)
    : cy.assertMuiInput('Value', criterionValue);
});

Cypress.Commands.add('enrollBeneficiariesIntoProgram', (
  programName,
  programCode,
  status, // Active, Potential etc.
  criterionField,
  criterionFilter,
  criterionValue,
  entityName,
) => {
  cy.chooseMuiAutocomplete(getProgramTerm({ capitalize: true }), programName)
  cy.chooseMuiSelect('Status', status.toUpperCase())

  cy.assertMuiSelectValue('Field', criterionField);
  cy.assertMuiSelectValue('Confirm Filters', criterionFilter);
  /^(True|False)$/.test(criterionValue)
    ? cy.assertMuiSelectValue('Value', criterionValue)
    : cy.assertMuiInput('Value', criterionValue);

  cy.contains('button', 'Preview Enrollment Process').click()

  cy.contains('h6', `Number Of Selected ${entityName}`)
    .next('p')
    .invoke('text')
    .then((text) => {
      const num = Number(text.trim());
      cy.wrap(num).as('numEnrolled');
      expect(num).to.be.greaterThan(0);
    });

  cy.contains('button', 'Confirm Enrollment Process').click()

  // confirmation dialog
  cy.contains('h2', 'Confirm Enrollment Process')
  cy.contains('button', 'Ok').click()

  // The enrollment page doesn't trigger journal update correctly
  // so we'd have to reload the page here
  cy.reload()

  // Verify enrollment in expanded journal drawer
  cy.get('.MuiDrawer-paperAnchorRight button')
    .first()
    .click();

  cy.get('ul.MuiList-root li')
    .first()
    .should('contain', 'Enrollment has been confirmed');

  // maker-checker approves enrollment
  cy.ensurePermissiveTaskGroup()
  cy.visit('/front/AllTasks')
  cy.contains('tfoot', 'Rows Per Page')
  cy.get('tr')
    .filter((_, tr) => (
      Cypress.$(tr).find('td:contains("import_valid_items")').length > 0 &&
      Cypress.$(tr).find('td:contains("RECEIVED")').length > 0
    ))
    .first()
    .within(() => {
      cy.get('td')
        .contains(new RegExp(`^${programCode}\\b`))
        .should('exist');

      cy.get('button[title="View details"]').click();
    });

  cy.contains('Import Valid Items Task')
  cy.chooseMuiAutocomplete('Task Group', 'any');
  cy.get('[title="Save changes"] button').click();

  cy.contains('div', 'Accept All')
    .find('button')
    .click();

  cy.contains('Beneficiary Upload Confirmation')
  cy.contains('button', 'Continue').click()
  cy.contains('div', 'Accept All')
    .find('button').should('be.disabled')

  cy.visit('/front/AllTasks')
  cy.get('tr')
    .filter((_, tr) => (
      Cypress.$(tr).find('td:contains("import_valid_items")').length > 0 &&
      Cypress.$(tr).find(`td:contains("${programCode}")`).length > 0
    ))
    .first()
    .within(() => {
      cy.contains('td', 'COMPLETED')
    });

  cy.visit('/front/benefitPlans');
  cy.openProgramForEditFromList(programName)
  cy.contains('button', 'Beneficiaries').click()
  cy.contains('button', status).click()

  cy.get('@numEnrolled').then((count) => {
    if (entityName === 'Groups') {
      cy.contains(`${count} Group Beneficiaries`)
    } else {
      cy.contains(`${count} Beneficiaries`)
    }
  });
})

Cypress.Commands.add('enrollIndividualBeneficiariesIntoProgram', (
  programName,
  programCode,
  status,
  criterionField,
  criterionFilter,
  criterionValue,
) => {
  cy.ensureSufficientIndividuals(100)

  cy.visit('/front/individuals')
  cy.contains('a', 'ENROLLMENT').click()

  cy.enrollBeneficiariesIntoProgram(
    programName, programCode, status,
    criterionField, criterionFilter, criterionValue, 'Individuals'
  )
})

Cypress.Commands.add('enrollGroupBeneficiariesIntoProgram', (
  programName,
  programCode,
  status,
  criterionField,
  criterionFilter,
  criterionValue,
) => {
  cy.ensureSufficientHouseholds(20)

  cy.visit('/front/groups')
  cy.contains('a', 'ENROLLMENT').click()

  cy.enrollBeneficiariesIntoProgram(
    programName, programCode, status,
    criterionField, criterionFilter, criterionValue, 'Groups'
  )
})


Cypress.Commands.add('enterMuiInput', (label, value, inputTag='input') => {
  cy.contains('label', label)
    .siblings('.MuiInputBase-root')
    .find(inputTag)
    .first()
    .clear({force: true})
    .type(value, {force: true});
})

Cypress.Commands.add('chooseMuiSelect', (label, value) => {
  cy.contains('label', label)
    .siblings('.MuiInputBase-root')
    .find('[role="button"]')
    .click()

  cy.contains('[role="listbox"] li', value).as('option')
  cy.get('@option').click()
})

Cypress.Commands.add('selectDropdownByLabel', (label, value = null) => {
  cy.contains('label', label)
    .parent()
    .click()

  if (value) {
    cy.contains('li[role="option"]', value)
      .click()
  } else {
    cy.get('li[role="option"]')
      .first()
      .click()
  }
})

Cypress.Commands.add('assertMuiInput', (label, value, inputTag='input') => {
  cy.contains('label', label)
    .siblings('.MuiInputBase-root')
    .find(inputTag)
    .should('be.visible')
    .and('have.value', value);
})

Cypress.Commands.add('assertMuiInputDisabled', (label, value=null, inputTag='input') => {
  const input = cy.contains('label', label)
    .siblings('.MuiInputBase-root')
    .find(inputTag)
  input.should('be.disabled');

  if (value) {
    input.should('have.value', value)
  }
})

Cypress.Commands.add('assertMuiSelectValue', (label, value) => {
  cy.contains('label', label)
    .siblings('.MuiInputBase-root')
    .contains(value)
})

Cypress.Commands.add('chooseMuiAutocomplete', (label, value) => {
  cy.contains('label', label)
    .siblings('.MuiInputBase-root')
    .find('input')
    .click()

  cy.contains('[role="menu"] li, [role="presentation"] li', value).click();
})

Cypress.Commands.add('setModuleConfig', (moduleName, configFixtureFile) => {
    cy.deleteModuleConfig(moduleName)

    cy.contains('a', 'Module configurations').click()

    // Create module config using fixture config file
    cy.contains('a', 'Add module configuration').click()
    cy.get('input[name="module"]').type(moduleName)
    cy.get('select[name="layer"]').select('backend')
    cy.get('input[name="version"]').type(1)

    cy.fixture(configFixtureFile).then((config) => {
      const configString = JSON.stringify(config, null, 2);
      cy.get('textarea[name="config"]')
        .type(configString, {
          parseSpecialCharSequences: false,
          delay: 0  // Type faster
        });

      cy.get('input[value="Save"]').click()
      cy.contains("was added successfully")
    })
})

Cypress.Commands.add('getItemCount', (itemName) => {
  const pattern = new RegExp(`\\d+ ${itemName}s? Found`);
  return cy.contains(pattern)
    .invoke('text')
    .then((text) => {
      const match = text.match(new RegExp(`(\\d+)\\s+${itemName}`));
      return parseInt(match?.[1], 10);
    });
});

Cypress.Commands.add('createGrievance', (grievanceData) => {
  cy.visit('/front/ticket/newTicket');

  // Required fields
  cy.enterMuiInput('Grievance Title', grievanceData.title);
  cy.selectDropdownByLabel('Category', grievanceData.category);
  cy.selectDropdownByLabel('Flag', grievanceData.flag);
  cy.selectDropdownByLabel('Channel', grievanceData.channel);

  // Optional fields
  if (grievanceData.priority) {
    cy.selectDropdownByLabel('Priority', grievanceData.priority);
  }

  if (grievanceData.dateOfIncident) {
    cy.contains('label', 'Date Of Incident')
      .parent()
      .find('input')
      .type(grievanceData.dateOfIncident);
  }

  if (grievanceData.assignedUser) {
    cy.chooseMuiAutocomplete('Assigned User', grievanceData.assignedUser);
  }

  if (grievanceData.details) {
    cy.enterMuiInput('DETAILS OF EVENT', grievanceData.details);
  }

  // Reporter type handling
  if (grievanceData.reporterType) {
    cy.selectDropdownByLabel('Reporter Type', grievanceData.reporterType);

    if (grievanceData.reporterType === 'Individual') {
      if (grievanceData.benefitPlan) {
        cy.chooseMuiAutocomplete(getProgramTerm({ capitalize: true }), grievanceData.benefitPlan);
      }
      if (grievanceData.individual) {
        cy.chooseMuiAutocomplete('Individual', grievanceData.individual);
      } else {
        // Select first available individual
        cy.contains('label', 'Individual')
          .siblings('.MuiInputBase-root')
          .find('input')
          .click();
        cy.get('[role="menu"] li, [role="presentation"] li').first().click();
      }
    } else if (grievanceData.reporterType === 'Beneficiary') {
      if (grievanceData.benefitPlan) {
        cy.chooseMuiAutocomplete(getProgramTerm({ capitalize: true }), grievanceData.benefitPlan);
      }
      if (grievanceData.beneficiary) {
        cy.chooseMuiAutocomplete('BeneficiaryPicker', grievanceData.beneficiary);
      } else {
        // Select first available beneficiary
        cy.wait(2000);
        cy.selectDropdownByLabel('BeneficiaryPicker')
      }
    } else if (grievanceData.reporterType === 'Attending Staff') {
      if (grievanceData.attendingStaff) {
        cy.chooseMuiAutocomplete('Complainant', grievanceData.attendingStaff);
      } else {
        // Select first available staff
        cy.contains('label', 'Complainant')
          .siblings('.MuiInputBase-root')
          .find('input')
          .click();
        cy.get('[role="menu"] li, [role="presentation"] li').first().click();
      }
    }
  }

  // Save the grievance
  cy.get('label[role="button"].MuiIconButton-colorPrimary').click();

  // Wait for creation to complete
  cy.get('ul.MuiList-root li div[role="progressbar"]', { timeout: 15000 }).should('exist');
  cy.get('ul.MuiList-root li div[role="progressbar"]', { timeout: 15000 }).should('not.exist');

  // Check journal for success
  cy.get('ul.MuiList-root li').first().click();
  cy.contains(`Created Ticket ${grievanceData.title}`).should('exist');
  cy.contains('Failed to create').should('not.exist');
});

Cypress.Commands.add('updateGrievance', (grievanceCode, updateData) => {
  cy.visit('/front/ticket/tickets');
  cy.contains('tfoot', 'Rows Per Page').should('be.visible');

  // Search for grievance by code
  cy.enterMuiInput('Code', grievanceCode);
  cy.contains('button', 'Search').click();
  cy.contains('tfoot', 'Rows Per Page').should('be.visible');

  // Open grievance for edit
  cy.contains('td', grievanceCode)
    .parent('tr')
    .within(() => {
      cy.get('button[title="Edit"]').click();
    });

  // Update fields (excluding reporter type and reporter info)
  if (updateData.title) {
    cy.enterMuiInput('Title', updateData.title);
  }

  if (updateData.category) {
    cy.selectDropdownByLabel('Category', updateData.category);
  }

  if (updateData.flag) {
    cy.selectDropdownByLabel('Flag', updateData.flag);
  }

  if (updateData.channel) {
    cy.selectDropdownByLabel('Channel', updateData.channel);
  }

  if (updateData.priority) {
    cy.selectDropdownByLabel('Priority', updateData.priority);
  }

  if (updateData.details) {
    cy.enterMuiInput('Description', updateData.details, 'textarea');
  }

  // Save changes
  cy.get('label[role="button"].MuiIconButton-colorPrimary').click();

  // Wait for update to complete
  cy.get('ul.MuiList-root li div[role="progressbar"]', { timeout: 15000 }).should('exist');
  cy.get('ul.MuiList-root li div[role="progressbar"]', { timeout: 15000 }).should('not.exist');

  // Check journal for success
  cy.get('ul.MuiList-root li').first().click();
  cy.contains('Updated Ticket', { timeout: 10000 }).should('exist');
  cy.contains('Failed to update').should('not.exist');
});

Cypress.Commands.add('resolveGrievance', (grievanceCode, comment) => {
  cy.visit('/front/ticket/tickets');
  cy.contains('tfoot', 'Rows Per Page').should('be.visible');

  // Search for grievance by code
  cy.enterMuiInput('Code', grievanceCode);
  cy.contains('button', 'Search').click();
  cy.contains('tfoot', 'Rows Per Page').should('be.visible');

  // Open grievance for edit
  cy.contains('td', grievanceCode)
    .parent('tr')
    .within(() => {
      cy.get('button[title="Edit"]').click();
    });

  // Add comment
  if (comment) {
    cy.enterMuiInput('Comment', comment, 'textarea');
  }

  // Mark as resolved
  cy.selectDropdownByLabel('Status', 'Resolved');

  // Save changes
  cy.get('[title="Save changes"] button, [title="Save"] button').click();

  // Wait for update to complete
  cy.get('ul.MuiList-root li div[role="progressbar"]', { timeout: 15000 }).should('exist');
  cy.get('ul.MuiList-root li div[role="progressbar"]', { timeout: 15000 }).should('not.exist');

  // Check journal for success
  cy.get('ul.MuiList-root li').first().click();
  cy.contains('Update ticket', { timeout: 10000 }).should('exist');
  cy.contains('Failed to update').should('not.exist');
});

Cypress.Commands.add('unlockGrievance', (grievanceCode) => {
  cy.visit('/front/ticket/tickets');
  cy.contains('tfoot', 'Rows Per Page').should('be.visible');

  // Search for grievance by code
  cy.enterMuiInput('Code', grievanceCode);
  cy.contains('button', 'Search').click();
  cy.contains('tfoot', 'Rows Per Page').should('be.visible');

  // Open grievance for edit
  cy.contains('td', grievanceCode)
    .parent('tr')
    .within(() => {
      cy.get('button[title="Edit"]').click();
    });

  // Unlock the grievance
  cy.get('button[title="Unlock"], button:contains("Unlock")').click();

  // Wait for unlock to complete
  cy.get('ul.MuiList-root li div[role="progressbar"]', { timeout: 15000 }).should('exist');
  cy.get('ul.MuiList-root li div[role="progressbar"]', { timeout: 15000 }).should('not.exist');
});

Cypress.Commands.add('checkGrievanceFieldValues', (title, category, flag, channel, priority = null, details = null) => {
  cy.assertMuiInput('Grievance Title', title);
  cy.assertMuiSelectValue('Category', category);
  cy.assertMuiSelectValue('Flag', flag);
  cy.assertMuiSelectValue('Channel', channel);

  if (priority) {
    cy.assertMuiSelectValue('Priority', priority);
  }

  if (details) {
    cy.assertMuiInput('Description', details);
  }
});

Cypress.Commands.add('checkGrievanceFieldValuesInListView', (title, category) => {
  cy.contains('tfoot', 'Rows Per Page').should('be.visible');

  cy.enterMuiInput('Title', title);
  cy.contains('button', 'Search').click();
  cy.contains('tfoot', 'Rows Per Page').should('be.visible');

  cy.contains('td', title).should('exist');
  cy.contains('td', title)
    .parent('tr')
    .within(() => {
      cy.contains('td', category).should('exist');
    });
});

Cypress.Commands.add('getGrievanceCodeFromList', (title) => {
  cy.visit('/front/ticket/tickets');
  cy.contains('tfoot', 'Rows Per Page').should('be.visible');

  cy.enterMuiInput('Title', title);
  cy.contains('button', 'Search').click();
  cy.contains('tfoot', 'Rows Per Page').should('be.visible');

  return cy.contains('td', title)
    .parent('tr')
    .find('td')
    .first()
    .invoke('text')
    .then((code) => code.trim());
});

Cypress.Commands.add('searchAndOpenGrievanceForEdit', (grievanceCode) => {
  cy.visit('/front/ticket/tickets');
  cy.contains('tfoot', 'Rows Per Page').should('be.visible');

  cy.enterMuiInput('Code', grievanceCode);
  cy.contains('button', 'Search').click();
  cy.contains('tfoot', 'Rows Per Page').should('be.visible');

  cy.contains('td', grievanceCode)
    .parent('tr')
    .within(() => {
      cy.get('button[title="Edit"]').click();
    });
});

Cypress.Commands.add('addGrievanceComment', (commentText, commentData = {}) => {
  cy.contains('button', 'Add Comment').click();
  cy.enterMuiInput('Comment', commentText);

  if (commentData.reporterType) {
    cy.selectDropdownByLabel('Reporter Type', commentData.reporterType);

    if (commentData.reporterType === 'Individual') {
      if (commentData.benefitPlan) {
        cy.chooseMuiAutocomplete(getProgramTerm({ capitalize: true }), commentData.benefitPlan);
      }
      if (commentData.individual) {
        cy.chooseMuiAutocomplete('Individual', commentData.individual);
      } else {
        cy.contains('label', 'Individual')
          .siblings('.MuiInputBase-root')
          .find('input')
          .click();
        cy.get('[role="menu"] li, [role="presentation"] li').first().click();
      }
    } else if (commentData.reporterType === 'Beneficiary') {
      if (commentData.benefitPlan) {
        cy.chooseMuiAutocomplete(getProgramTerm({ capitalize: true }), commentData.benefitPlan);
      }
      if (commentData.beneficiary) {
        cy.chooseMuiAutocomplete('Beneficiary', commentData.beneficiary);
      } else {
        cy.wait(2000);
        cy.contains('label', 'Beneficiary')
          .siblings('.MuiInputBase-root')
          .find('input')
          .click();
        cy.get('[role="menu"] li, [role="presentation"] li').first().click();
      }
    } else if (commentData.reporterType === 'Attending Staff') {
      if (commentData.attendingStaff) {
        cy.chooseMuiAutocomplete('Commenter', commentData.attendingStaff);
      } else {
        cy.contains('label', 'Commenter')
          .siblings('.MuiInputBase-root')
          .find('input')
          .click();
        cy.get('[role="menu"] li, [role="presentation"] li').first().click();
      }
    }
  }

  cy.contains('button', 'Save').click();

  // NOTE: adding a grievance comment triggers a background job, so we wait a bit here also it doesn't reflect in the logs UI as loading spinner
  cy.wait(2000); // wait for comment to be added
  cy.contains(commentText).should('exist');
});
