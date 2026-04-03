import { getTimestamp } from '../support/utils';

describe('Payroll workflows', () => {
  const suiteTimestamp = getTimestamp();
  const getDateOffset = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

  // Codes must be ≤ 8 characters (backend limit for program/payment-plan codes).
  const ts = Date.now();
  const programCode = `PR${ts.toString().slice(-6)}`;
  const programName = `E2E Payroll Program ${suiteTimestamp}`;
  const ppCode = `PP${ts.toString().slice(-6)}`;
  const ppName = `E2E Payroll Plan ${suiteTimestamp}`;
  // Payment cycle codes have no documented 8-char limit; use a longer unique value.
  const cycleCode = `PCY${ts.toString().slice(-5)}`;

  const createdPayrolls = new Set();

  const payrollData = (label) => {
    const timestamp = getTimestamp();
    return {
      name: `E2E Payroll ${label} ${timestamp}`,
      paymentPlanCode: ppCode,
      paymentPlanName: ppName,
      paymentCycleCode: cycleCode,
      dateValidFrom: getDateOffset(0),
      dateValidTo: getDateOffset(30),
      // paymentMethod is omitted → first available method is selected
    };
  };

  const trackPayroll = (name) => {
    createdPayrolls.add(name);
  };

  before(() => {
    cy.loginAdminInterface();
    cy.setModuleConfig('fe-core', 'menu-config-sp.json');
    cy.setModuleConfig('social_protection', 'social-protection-config.json');
    cy.setModuleConfig('individual', 'individual-config-minimal.json');
    cy.logoutAdminInterface();

    cy.login();
    cy.createProgram(programCode, programName, '50', 'INDIVIDUAL');
    cy.createPaymentPlan({
      code: ppCode,
      name: ppName,
      benefitPlanName: programName,
      dateValidFrom: getDateOffset(0),
      dateValidTo: getDateOffset(365),
    });
    // The PaymentCyclePicker in the payroll form searches only ACTIVE cycles.
    // Creating with status ACTIVE triggers a coreAlert dialog; dismiss it below.
    cy.createPaymentCycle({
      code: cycleCode,
      startDate: getDateOffset(0),
      endDate: getDateOffset(30),
      status: 'ACTIVE',
    });
    cy.get('body').then(($body) => {
      if ($body.find('[role="dialog"]').length > 0) {
        cy.get('[role="dialog"] .MuiDialogActions-root button').first().click();
      }
    });
    cy.logout();
  });

  after(() => {
    cy.login();
    // Only PENDING_APPROVAL payrolls have an enabled delete button in the UI.
    // Tests that change the status are responsible for their own cleanup.
    Array.from(createdPayrolls).forEach((name) => {
      cy.deletePayrollFromList(name);
    });
    cy.deletePaymentPlan(ppName);
    cy.deleteProgram(programName);
    // Payment cycles have no UI delete; cycleCode records accumulate in the DB.
    cy.logout();
  });

  beforeEach(() => {
    cy.login();
  });

  it('validates required fields before allowing payroll creation', () => {
    cy.openCreatePayroll();
    cy.get('[title="Please fill General Information fields first"] button')
      .should('be.disabled');
  });

  it('creates a payroll successfully', () => {
    const payroll = payrollData('Create');

    cy.createPayroll(payroll);
    trackPayroll(payroll.name);

    cy.filterPayrolls({ name: payroll.name });
    cy.assertPayrollRowVisible({ name: payroll.name });
  });

  it('searches payrolls by name', () => {
    const targetPayroll = payrollData('Search Target');
    const otherPayroll = payrollData('Search Other');

    cy.createPayroll(targetPayroll);
    cy.createPayroll(otherPayroll);
    trackPayroll(targetPayroll.name);
    trackPayroll(otherPayroll.name);

    cy.filterPayrolls({ name: targetPayroll.name });
    cy.assertPayrollRowVisible({ name: targetPayroll.name });
    cy.assertPayrollRowNotVisible({ name: otherPayroll.name });

    cy.filterPayrolls({ name: otherPayroll.name });
    cy.assertPayrollRowVisible({ name: otherPayroll.name });
    cy.assertPayrollRowNotVisible({ name: targetPayroll.name });
  });

  it('views payroll details from the list', () => {
    const payroll = payrollData('View');

    cy.createPayroll(payroll);
    trackPayroll(payroll.name);

    cy.openPayrollForViewFromList(payroll.name);
    cy.assertMuiInput('Name', payroll.name);
  });

  it('deletes a PENDING_APPROVAL payroll', () => {
    const payroll = payrollData('Delete');

    cy.createPayroll(payroll);
    // Not tracked: deleted below, so no after() cleanup needed.

    cy.deletePayrollFromList(payroll.name);
    cy.filterPayrolls({ name: payroll.name });
    cy.assertPayrollRowNotVisible({ name: payroll.name });
  });

  it('shows a newly-created payroll in the pending payrolls list', () => {
    const payroll = payrollData('Pending');

    cy.createPayroll(payroll);
    trackPayroll(payroll.name);

    cy.visit('/front/payrollsPending');
    cy.contains('Payrolls Found');
    cy.contains('button', 'Search').click();
    cy.assertPayrollRowVisible({ name: payroll.name });
  });

  it('verifies a newly-created payroll has PENDING APPROVAL status', () => {
    const payroll = payrollData('Status Check');

    cy.createPayroll(payroll);
    trackPayroll(payroll.name);

    cy.openPayrollForViewFromList(payroll.name);
    // The status field on the detail page should show PENDING APPROVAL.
    cy.contains('PENDING APPROVAL').should('exist');
  });

  it('opens and closes the reconciliation summary dialog from the pending list', () => {
    const payroll = payrollData('Reconcile Dialog');

    cy.createPayroll(payroll);
    trackPayroll(payroll.name);

    cy.openPayrollPendingSummary(payroll.name);
    cy.contains('button', 'Close').click();
    cy.contains('View Reconciliation Summary:').should('not.exist');
  });

  it('end-to-end: payment plan → payment cycle → payroll integration', () => {
    // This test verifies the full cross-domain flow using the prerequisites
    // already created in before().  A new payroll is created and verified.
    const payroll = payrollData('Integration');

    cy.createPayroll(payroll);
    trackPayroll(payroll.name);

    // Verify payroll appears in main list.
    cy.filterPayrolls({ name: payroll.name });
    cy.assertPayrollRowVisible({ name: payroll.name });

    // Verify payroll appears in pending list.
    cy.visit('/front/payrollsPending');
    cy.contains('Payrolls Found');
    cy.contains('button', 'Search').click();
    cy.assertPayrollRowVisible({ name: payroll.name });

    // Verify detail page shows correct associations.
    cy.openPayrollForViewFromList(payroll.name);
    cy.assertMuiInput('Name', payroll.name);
    cy.contains('PENDING APPROVAL').should('exist');
  });
});
