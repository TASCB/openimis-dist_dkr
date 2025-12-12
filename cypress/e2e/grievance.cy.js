import { getProgramTerm, getTimestamp } from '../support/utils';

describe('Grievance module workflows', () => {
  let testGrievanceCodes = [];

  beforeEach(function () {
    cy.login();
  });

  describe('Grievance creation with different reporter types', () => {
    const timestamp = getTimestamp();

    it('Creates an anonymous grievance (None reporter type)', function () {
      const grievanceData = {
        title: `E2E Anonymous Grievance ${timestamp}`,
        category: 'Category A',
        flag: 'Flag A',
        channel: 'Channel A',
        priority: 'High',
        details: 'This is a test grievance with no reporter information.',
        reporterType: 'None',
      };

      cy.createGrievance(grievanceData);

      cy.visit('/front/ticket/tickets');
      cy.checkGrievanceFieldValuesInListView(grievanceData.title, grievanceData.category);

      cy.getGrievanceCodeFromList(grievanceData.title).then(code => {
        testGrievanceCodes.push(code);
      });
    });

    it('Creates a grievance with Individual reporter type', function () {
      cy.ensureSufficientIndividuals(10);

      const grievanceData = {
        title: `E2E Individual Reporter Grievance ${timestamp}`,
        category: 'Category B',
        flag: 'Flag B',
        channel: 'Channel B',
        priority: 'Normal',
        details: 'This grievance is reported by an individual from the registry.',
        reporterType: 'Individual',
      };

      cy.createGrievance(grievanceData);

      cy.visit('/front/ticket/tickets');
      cy.checkGrievanceFieldValuesInListView(grievanceData.title, grievanceData.category);

      cy.getGrievanceCodeFromList(grievanceData.title).then(code => {
        testGrievanceCodes.push(code);
      });
    });

    describe('with Beneficiary reporter type', () => {
      const programCode = 'E2EGRBP';
      const programName = 'E2E Grievance Beneficiary Program';

      before(() => {
        // Disable maker checker
        cy.loginAdminInterface()
        cy.setModuleConfig('social_protection', 'social-protection-config.json')
        cy.setModuleConfig('individual', 'individual-config-minimal.json')
        cy.logoutAdminInterface()
      })

      before(function () {
        cy.login();

        const maxBeneficiaries = '50';
        const programType = 'INDIVIDUAL';

        cy.createProgram(programCode, programName, maxBeneficiaries, programType);

        const criterionField = 'Able bodied';
        const criterionFilter = 'Exact';
        const criterionValue = 'False';

        cy.configureDefaultEnrollmentCriteria(
          programName,
          'Active',
          criterionField,
          criterionFilter,
          criterionValue
        );

        cy.enrollIndividualBeneficiariesIntoProgram(
          programName,
          programCode,
          'Active',
          criterionField,
          criterionFilter,
          criterionValue
        );

        cy.logout();
      });

      after(function () {
        cy.deleteProgram(programName);
      });

      it('Creates a grievance with Beneficiary reporter type', function () {
        const grievanceData = {
          title: 'E2E Beneficiary Reporter Grievance',
          category: 'Category A',
          flag: 'Flag A',
          channel: 'Channel A',
          details: 'This grievance is reported by a beneficiary.',
          reporterType: 'Beneficiary',
          benefitPlan: programName,
        };

        cy.createGrievance(grievanceData);

        cy.visit('/front/ticket/tickets');
        cy.checkGrievanceFieldValuesInListView(grievanceData.title, grievanceData.category);

        cy.getGrievanceCodeFromList(grievanceData.title).then(code => {
          testGrievanceCodes.push(code);
        });
      });
    });

    it('Creates a grievance with Attending Staff reporter type', function () {
      const grievanceData = {
        title: `E2E Staff Reporter Grievance ${timestamp}`,
        category: 'Category B',
        flag: 'Flag B',
        channel: 'Channel B',
        priority: 'Low',
        details: 'This grievance is reported by an attending staff member.',
        reporterType: 'Attending Staff',
      };

      cy.createGrievance(grievanceData);

      cy.visit('/front/ticket/tickets');
      cy.checkGrievanceFieldValuesInListView(grievanceData.title, grievanceData.category);

      cy.getGrievanceCodeFromList(grievanceData.title).then(code => {
        testGrievanceCodes.push(code);
      });
    });
  });

  describe('Grievance comments with reporter types', () => {
    const timestamp = getTimestamp();
    let grievanceCode;

    before(function () {
      cy.login();
      const grievanceData = {
        title: `E2E Comment Test Grievance ${timestamp}`,
        category: 'Category A',
        flag: 'Flag A',
        channel: 'Channel A',
        details: 'Grievance for testing comments with reporter types.',
        reporterType: 'None',
      };

      cy.createGrievance(grievanceData);

      cy.getGrievanceCodeFromList(grievanceData.title).then(code => {
        grievanceCode = code;
      });
      cy.logout();
    });

    beforeEach(function () {
      cy.searchAndOpenGrievanceForEdit(grievanceCode);
    });

    it('Adds a comment without reporter type', function () {
      const commentText = 'This is a test comment without reporter information.';
      cy.addGrievanceComment(commentText);
    });

    it('Adds a comment with Individual reporter type', function () {
      cy.ensureSufficientIndividuals(5);

      const commentText = 'Comment from an individual reporter.';
      cy.addGrievanceComment(commentText, { reporterType: 'Individual' });
    });

    describe('with Beneficiary reporter type', () => {
      const programCode = 'E2EGCBP';
      const programName = 'E2E Grievance Comment Beneficiary Program';

      before(function () {
        cy.login();

        const maxBeneficiaries = '30';
        const programType = 'INDIVIDUAL';

        cy.createProgram(programCode, programName, maxBeneficiaries, programType);

        const criterionField = 'Able bodied';
        const criterionFilter = 'Exact';
        const criterionValue = 'True';

        cy.configureDefaultEnrollmentCriteria(
          programName,
          'Active',
          criterionField,
          criterionFilter,
          criterionValue
        );

        cy.enrollIndividualBeneficiariesIntoProgram(
          programName,
          programCode,
          'Active',
          criterionField,
          criterionFilter,
          criterionValue
        );

        cy.logout();
      });

      after(function () {
        cy.login();
        cy.deleteProgram(programName);
        cy.logout();
      });

      it('Adds a comment with Beneficiary reporter type', function () {
        const commentText = 'Comment from a beneficiary reporter.';
        cy.addGrievanceComment(commentText, {
          reporterType: 'Beneficiary',
          benefitPlan: programName,
        });
      });
    });

    it('Adds a comment with Attending Staff reporter type', function () {
      const commentText = 'Comment from attending staff.';
      cy.addGrievanceComment(commentText, { reporterType: 'Attending Staff' });
    });
  });

  describe('Grievance list view and filters', () => {
    const timestamp = getTimestamp();
    const grievanceCodes = [];

    before(function () {
      cy.login();

      const grievances = [
        {
          title: `E2E Filter Test Critical ${timestamp}`,
          category: 'Category A',
          flag: 'Flag A',
          channel: 'Channel A',
          priority: 'Critical',
          reporterType: 'None',
        },
        {
          title: `E2E Filter Test Normal ${timestamp}`,
          category: 'Category B',
          flag: 'Flag B',
          channel: 'Channel B',
          priority: 'Normal',
          reporterType: 'None',
        },
        {
          title: `E2E Filter Test Low ${timestamp}`,
          category: 'Category A',
          flag: 'Flag A',
          channel: 'Channel A',
          priority: 'Low',
          reporterType: 'None',
        },
      ];

      grievances.forEach((data) => {
        cy.createGrievance(data);
        cy.getGrievanceCodeFromList(data.title).then((code) => {
          grievanceCodes.push(code);
        });
      });

      cy.logout();
    });

    beforeEach(function () {
      cy.login();
      cy.visit('/front/ticket/tickets');
      cy.contains('tfoot', 'Rows Per Page').should('be.visible');
    });

    it('Displays grievance list with all created grievances', function () {
      cy.get('table tbody tr').should('have.length.at.least', 3);

      grievanceCodes.forEach((code) => {
        cy.contains('td', code).should('exist');
      });
    });

    it('Filters grievances by title', function () {
      const searchTitle = `E2E Filter Test Critical ${timestamp}`;

      cy.enterMuiInput('Title', searchTitle);
      cy.contains('button', 'Search').click();
      cy.contains('tfoot', 'Rows Per Page').should('be.visible');

      cy.contains('td', searchTitle).should('exist');
      cy.get('table tbody tr').should('have.length', 1);
    });

    it('Filters grievances by category', function () {
      cy.selectDropdownByLabel('Category', 'Category A');
      cy.contains('button', 'Search').click();
      cy.contains('tfoot', 'Rows Per Page').should('be.visible');

      cy.get('table tbody tr').each(($row) => {
        cy.wrap($row).within(() => {
          cy.contains('td', 'Category A').should('exist');
        });
      });
    });

    it('Filters grievances by priority', function () {
      cy.selectDropdownByLabel('Priority', 'Critical');
      cy.contains('button', 'Search').click();
      cy.contains('tfoot', 'Rows Per Page').should('be.visible');

      cy.get('table tbody tr').each(($row) => {
        cy.wrap($row).within(() => {
          cy.contains('td', 'Critical').should('exist');
        });
      });
    });

    it('Filters grievances by code', function () {
      const testCode = grievanceCodes[0];

      cy.enterMuiInput('Code', testCode);
      cy.contains('button', 'Search').click();
      cy.contains('tfoot', 'Rows Per Page').should('be.visible');

      cy.contains('td', testCode).should('exist');
      cy.get('table tbody tr').should('have.length', 1);
    });

    it('Shows historical grievances when Show History is checked', function () {
      cy.getItemCount('Ticket').as('initialCount');

      cy.contains('label', 'Show History').click();
      cy.contains('button', 'Search').click();
      cy.contains('tfoot', 'Rows Per Page').should('be.visible');

      cy.get('@initialCount').then((initialCount) => {
        cy.getItemCount('Ticket').then((newCount) => {
          expect(newCount).to.be.gte(initialCount);
        });
      });
    });

    it('Clears all filters when Clear button is clicked', function () {
      cy.enterMuiInput('Title', 'Test Filter');
      cy.selectDropdownByLabel('Priority', 'Critical');
      cy.selectDropdownByLabel('Category', 'Category A');

      cy.contains('button', 'Clear').click();

      cy.contains('label', 'Title')
        .siblings('.MuiInputBase-root')
        .find('input')
        .should('have.value', '');

      cy.contains('button', 'Search').click();
      cy.contains('tfoot', 'Rows Per Page').should('be.visible');
      cy.get('table tbody tr').should('have.length.at.least', 3);
    });
  });

  describe('Grievance navigation and UI elements', () => {
    beforeEach(function () {
      cy.login();
    });

    it('Navigates to grievance creation page from menu', function () {
      cy.visit('/front');

      cy.get('div.MuiDrawer-root').first().within(() => {
        cy.contains('div[role="button"]', 'Grievance').click();
        cy.contains('div[role="button"]', 'Add').click();
      });

      cy.url().should('include', '/front/ticket/newTicket');
      cy.contains('label', 'Grievance Title').should('exist');
      cy.contains('label', 'Category').should('exist');
    });

    it('Navigates to grievance list page from menu', function () {
      cy.visit('/front');

      cy.get('div.MuiDrawer-root').first().within(() => {
        cy.contains('div[role="button"]', 'Grievance').click();
        cy.contains('div[role="button"]', 'Grievances').click();
      });

      cy.url().should('include', '/front/ticket/tickets');
      cy.contains('Tickets Found').should('exist');
    });

    it('Displays required field validation on empty form submission', function () {
      cy.visit('/front/ticket/newTicket');

      cy.get('label[role="button"].MuiIconButton-colorPrimary').should('be.disabled');

      cy.contains('label', 'Grievance Title').should('exist');
      cy.contains('label', 'Category').should('exist');
      cy.contains('label', 'Flag').should('exist');
      cy.contains('label', 'Channel').should('exist');
    });

    it('Verifies create button is available on list page', function () {
      cy.visit('/front/ticket/tickets');
      cy.contains('tfoot', 'Rows Per Page').should('be.visible');

      cy.get('[title="Create"] button').should('exist');

      cy.get('[title="Create"] button').click();
      cy.url().should('include', '/front/ticket/newTicket');
    });
  });
});
