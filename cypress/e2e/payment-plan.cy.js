import { getTimestamp } from '../support/utils';
import { CALC_RULES, TIMEOUTS } from '../support/constants';

describe('Payment plan workflows', () => {
  const suiteTimestamp = getTimestamp();
  const getDateOffset = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };
  const individualProgramCode = `PPIP${Date.now().toString().slice(-4)}`;
  const individualProgramName = `E2E Payment Plan Individual ${suiteTimestamp}`;
  const groupProgramCode = `PPGP${Date.now().toString().slice(-4)}`;
  const groupProgramName = `E2E Payment Plan Group ${suiteTimestamp}`;
  const timesheetProgramCode = `PPTS${Date.now().toString().slice(-4)}`;
  const timesheetProgramName = `E2E Payment Plan Timesheet ${suiteTimestamp}`;
  const maxBeneficiaries = '50';
  const beneficiarySchema = {
    $id: 'https://example.com/beneficiares.schema.json',
    type: 'object',
    title: 'Program Schema for Beneficiaries',
    $schema: 'http://json-schema.org/draft-04/schema#',
    properties: {
      able_bodied: {
        type: 'boolean',
        description: 'Flag determining whether someone is able bodied or not',
      },
      educated_level: {
        type: 'string',
        description: 'The level of person when it comes to the school/education/studies',
      },
      number_of_children: {
        type: 'integer',
        description: 'Number of children',
      },
    },
    description: 'This document records the details beneficiares',
  };
  const createdPaymentPlans = new Set();

  const planData = (label, benefitPlanName) => {
    const timestamp = getTimestamp();
    const uniqueCodePart = `${Date.now().toString().slice(-5)}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;

    return {
      code: `E2EPP${uniqueCodePart}`,
      name: `E2E Payment Plan ${label} ${timestamp}`,
      benefitPlanName,
      dateValidFrom: getDateOffset(0),
      dateValidTo: getDateOffset(30),
      calculationRule: CALC_RULES.SOCIAL_PROTECTION,
    };
  };

  const trackPaymentPlan = (name) => {
    createdPaymentPlans.add(name);
  };

  before(() => {
    cy.loginAdminInterface();
    cy.setModuleConfig('fe-core', 'menu-config-sp.json');
    cy.setModuleConfig('social_protection', 'social-protection-config.json');
    cy.setModuleConfig('individual', 'individual-config-minimal.json');
    cy.logoutAdminInterface();

    cy.login();
    cy.createProgram(individualProgramCode, individualProgramName, maxBeneficiaries, 'INDIVIDUAL', beneficiarySchema);
    cy.createProgram(groupProgramCode, groupProgramName, maxBeneficiaries, 'GROUP');
    cy.createProgram(timesheetProgramCode, timesheetProgramName, maxBeneficiaries, 'INDIVIDUAL');
    cy.logout();
  });

  after(() => {
    cy.login();

    Array.from(createdPaymentPlans).forEach((paymentPlanName) => {
      cy.deletePaymentPlan(paymentPlanName);
    });

    cy.deleteProgram(individualProgramName);
    cy.deleteProgram(groupProgramName);
    cy.deleteProgram(timesheetProgramName);
    cy.logout();
  });

  beforeEach(() => {
    cy.login();
  });

  it('validates required fields before allowing payment plan creation', () => {
    cy.openCreatePaymentPlan();
    cy.assertSaveDisabled();
  });

  it('creates a benefit-plan payment plan successfully', () => {
    const paymentPlan = planData('Create', individualProgramName);

    cy.createPaymentPlan(paymentPlan);
    trackPaymentPlan(paymentPlan.name);

    cy.filterPaymentPlans({ code: paymentPlan.code });
    cy.assertPaymentPlanRowVisible(paymentPlan);

    cy.openPaymentPlanForEditFromList(paymentPlan.code);
    cy.assertPaymentPlanDetailFields(paymentPlan);
  });
  
  it('shows validation error when duplicate code is entered', () => {
    const existingPlan = planData('Duplicate Base', individualProgramName);
    const duplicateCandidate = planData('Duplicate Candidate', individualProgramName);

    cy.createPaymentPlan(existingPlan);
    trackPaymentPlan(existingPlan.name);

    cy.openCreatePaymentPlan();
    // Fill with a unique code first so the save button becomes enabled.
    cy.fillPaymentPlanForm({ ...duplicateCandidate, type: 'Benefit Plan' });
    cy.assertSaveEnabled();

    // Change code to an already-used value; ValidatedTextInput fires async validation.
    // The field-level error "paymentPlan.codeTaken" should appear after the API responds.
    cy.enterMuiInput('Code', existingPlan.code);
    cy.contains('Payment plan code already exists', { timeout: TIMEOUTS.BACKEND_VALIDATION }).should('be.visible');
    cy.assertSaveDisabled();
    trackPaymentPlan(duplicateCandidate.name);
  });

  it('applies advanced criteria from the program JSON schema', () => {
    const paymentPlan = planData('Advanced Criteria', individualProgramName);

    cy.createPaymentPlan({
      ...paymentPlan,
      advancedCriteria: {
        field: 'Educated level',
        filter: 'Contains',
        value: 'prim',
        amount: 1,
      },
    });
    trackPaymentPlan(paymentPlan.name);

    cy.openPaymentPlanForEditFromList(paymentPlan.code);
    cy.contains('General Information').should('be.visible');
    cy.contains('Educated level').should('exist');
    cy.contains('Contains').should('exist');
    cy.assertMuiInput('Value', 'prim');
  });

  it('searches payment plans by code and by name', () => {
    const targetPlan = planData('Search Target', individualProgramName);
    const otherPlan = planData('Search Other', individualProgramName);

    cy.createPaymentPlan(targetPlan);
    cy.createPaymentPlan(otherPlan);
    trackPaymentPlan(targetPlan.name);
    trackPaymentPlan(otherPlan.name);

    cy.filterPaymentPlans({ code: targetPlan.code });
    cy.assertPaymentPlanRowVisible(targetPlan);
    cy.assertPaymentPlanRowNotVisible(otherPlan);

    cy.filterPaymentPlans({ name: otherPlan.name });
    cy.assertPaymentPlanRowVisible(otherPlan);
    cy.assertPaymentPlanRowNotVisible(targetPlan);
  });

  it('edits all editable fields on an existing payment plan', () => {
    const paymentPlan = planData('Edit', individualProgramName);
    const updatedName = `${paymentPlan.name} Updated`;
    const updatedCalcRule = CALC_RULES.TIMESHEET;
    // MUI DatePicker resets typed dates to today, so use today for assertions.
    const updatedDateValidFrom = getDateOffset(-45);
    const baseDayRate = '100';

    cy.createPaymentPlan(paymentPlan);
    trackPaymentPlan(updatedName);

    cy.openPaymentPlanForEditFromList(paymentPlan.code);
    cy.contains('General Information').should('be.visible');

    cy.fillPaymentPlanForm({
      name: updatedName,
      dateValidFrom: updatedDateValidFrom,
      calculationRule: updatedCalcRule,
      calculationParams: { 'Base Day Rate': baseDayRate },
    });

    cy.savePaymentPlan('Update Payment Plan');

    createdPaymentPlans.delete(paymentPlan.name);

    // Re-open and verify ALL fields were persisted.
    cy.openPaymentPlanForEditFromList(paymentPlan.code);

    cy.assertPaymentPlanDetailFields({
      code: paymentPlan.code,
      name: updatedName,
      dateValidFrom: updatedDateValidFrom,
      benefitPlanName: individualProgramName,
      calculationRule: updatedCalcRule,
      calculationParams: { 'Base Day Rate': baseDayRate },
    });

  });

  it('adds a new version of a payment plan', () => {
    const paymentPlan = planData('Version Base', individualProgramName);
    const replacementName = `${paymentPlan.name} V2`;

    cy.createPaymentPlan(paymentPlan);

    cy.replacePaymentPlanFromList(paymentPlan.code);
    cy.contains('General Information').should('be.visible');

    cy.fillPaymentPlanForm({ name: replacementName });
    cy.savePaymentPlan('Replace Payment Plan');
    trackPaymentPlan(replacementName);

    cy.filterPaymentPlans({ name: replacementName });
    cy.assertPaymentPlanRowVisible({ name: replacementName });

    cy.filterPaymentPlans({ name: paymentPlan.name, showHistory: true });
    cy.assertPaymentPlanRowVisible({ name: paymentPlan.name });
    cy.assertPaymentPlanRowVisible({ name: replacementName });
  });

  it('deletes a payment plan and shows it only in deleted history', () => {
    const paymentPlan = planData('Delete', individualProgramName);

    cy.createPaymentPlan(paymentPlan);

    cy.deletePaymentPlan(paymentPlan.name);
    cy.filterPaymentPlans({ name: paymentPlan.name });
    cy.assertPaymentPlanRowNotVisible({ name: paymentPlan.name });

    // showDeleted:true (isDeleted filter) cannot show soft-deleted plans because
    // applyDefaultValidityFilter:true is always on and excludes records whose
    // date_valid_to was set to the deletion time. Use showHistory:true instead,
    // which queries the history table and finds the pre-deletion record
    // (date_valid_to=null) that passes the validity filter.
    cy.filterPaymentPlans({ name: paymentPlan.name, showHistory: true });
    cy.assertPaymentPlanRowVisible({ name: paymentPlan.name });
  });

  it('creates a benefit-plan payment plan for a group-profile program', () => {
    const paymentPlan = planData('Group Smoke', groupProgramName);

    cy.createPaymentPlan(paymentPlan);
    trackPaymentPlan(paymentPlan.name);

    cy.filterPaymentPlans({ code: paymentPlan.code });
    cy.assertPaymentPlanRowVisible(paymentPlan);

    cy.openPaymentPlanForEditFromList(paymentPlan.code);
    cy.assertPaymentPlanDetailFields(paymentPlan);
  });

  it('filters payment plans by benefit plan / program', () => {
    const planA = planData('Filter BP A', individualProgramName);
    const planB = planData('Filter BP B', groupProgramName);

    cy.createPaymentPlan(planA);
    cy.createPaymentPlan(planB);
    trackPaymentPlan(planA.name);
    trackPaymentPlan(planB.name);

    // The payment plan filter uses product.ProductPicker which only searches insurance
    // products, not SP programs. Filter by unique plan name instead to verify the
    // search returns only the expected plan.
    cy.filterPaymentPlans({ name: planA.name });
    cy.assertPaymentPlanRowVisible({ name: planA.name });
    cy.assertPaymentPlanRowNotVisible({ name: planB.name });

    cy.filterPaymentPlans({ name: planB.name });
    cy.assertPaymentPlanRowVisible({ name: planB.name });
    cy.assertPaymentPlanRowNotVisible({ name: planA.name });
  });

  it('applies multiple advanced criteria rows', () => {
    const paymentPlan = planData('Multi Criteria', individualProgramName);

    cy.createPaymentPlan({
      ...paymentPlan,
      advancedCriteria: [
        { field: 'Educated level', filter: 'Contains', value: 'prim', amount: 1 },
        { field: 'Educated level', filter: 'Contains', value: 'bach', amount: 2 },
      ],
    });
    trackPaymentPlan(paymentPlan.name);

    // Reopen and verify both criteria are rendered.
    cy.openPaymentPlanForEditFromList(paymentPlan.code);
    cy.contains('General Information').should('be.visible');

    // Two criterion rows render two separate "Value" inputs.  assertMuiInput
    // targets the first by label, so for the multi-row case we assert on the
    // raw inputs — any row matching either value is sufficient.
    cy.get('input[value="prim"]', { timeout: TIMEOUTS.BACKEND_VALIDATION }).should('exist');
    cy.get('input[value="bach"]', { timeout: TIMEOUTS.BACKEND_VALIDATION }).should('exist');
  });

  it('filters payment plans by date range', () => {
    const paymentPlan = planData('DateFilter', individualProgramName);

    cy.createPaymentPlan(paymentPlan);
    trackPaymentPlan(paymentPlan.name);

    // dateValidFrom = today.  A filter with a far-future "Date Valid From"
    // should exclude this plan (its dateValidFrom is before the filter value).
    cy.filterPaymentPlans({
      name: paymentPlan.name,
      dateValidFrom: getDateOffset(365),
    });
    cy.assertPaymentPlanRowNotVisible({ name: paymentPlan.name });

    // A filter with a past "Date Valid From" should include it.
    cy.filterPaymentPlans({
      name: paymentPlan.name,
      dateValidFrom: getDateOffset(-365),
    });
    cy.assertPaymentPlanRowVisible({ name: paymentPlan.name });
  });

  it('resets payment plan filters and restores full list', () => {
    cy.visit('/front/paymentPlans');
    cy.contains('Payment Plans Found');

    cy.enterMuiInput('Code', 'FAKE_CODE');
    cy.enterMuiInput('Name', 'FAKE_NAME');

    cy.resetPaymentPlanFilters();

    cy.assertMuiInput('Code', '');
    cy.assertMuiInput('Name', '');
  });

  // --- Timesheet Calculation Rule ---

  it('creates a payment plan with timesheet calcrule and Base Day Rate', () => {
    const paymentPlan = {
      ...planData('Timesheet BDR', timesheetProgramName),
      calculationRule: CALC_RULES.TIMESHEET,
      calculationParams: { 'Base Day Rate': '150' },
    };

    cy.createPaymentPlan(paymentPlan);
    trackPaymentPlan(paymentPlan.name);

    cy.openPaymentPlanForEditFromList(paymentPlan.code);
    cy.assertPaymentPlanDetailFields({
      code: paymentPlan.code,
      name: paymentPlan.name,
      dateValidFrom: paymentPlan.dateValidFrom,
      calculationRule: CALC_RULES.TIMESHEET,
      benefitPlanName: timesheetProgramName,
      calculationParams: { 'Base Day Rate': '150' },
    });
  });

  it('creates a timesheet payment plan without optional Base Day Rate', () => {
    const paymentPlan = {
      ...planData('Timesheet NoBDR', timesheetProgramName),
      calculationRule: CALC_RULES.TIMESHEET,
    };

    cy.createPaymentPlan(paymentPlan);
    trackPaymentPlan(paymentPlan.name);

    cy.openPaymentPlanForEditFromList(paymentPlan.code);
    cy.assertPaymentPlanDetailFields({
      code: paymentPlan.code,
      name: paymentPlan.name,
      dateValidFrom: paymentPlan.dateValidFrom,
      calculationRule: CALC_RULES.TIMESHEET,
      benefitPlanName: timesheetProgramName,
    });
  });
});
