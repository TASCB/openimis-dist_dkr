import { getTimestamp } from '../support/utils';

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
      // dateValidTo is intentionally omitted — it is optional for payment plans
      // and the MUI DatePicker dialog overwrites typed values with "today",
      // causing dateValidTo == dateValidFrom which hides plans from the list.
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
    cy.logout();
  });

  after(() => {
    cy.login();

    Array.from(createdPaymentPlans).forEach((paymentPlanName) => {
      cy.deletePaymentPlan(paymentPlanName);
    });

    cy.deleteProgram(individualProgramName);
    cy.deleteProgram(groupProgramName);
    cy.logout();
  });

  beforeEach(() => {
    cy.login();
  });

  it('validates required fields before allowing payment plan creation', () => {
    cy.openCreatePaymentPlan();
    cy.get('[title="Please fill General Information fields first"] button')
      .should('be.disabled');
  });

  it('creates a benefit-plan payment plan successfully', () => {
    const paymentPlan = planData('Create', individualProgramName);

    cy.createPaymentPlan(paymentPlan);
    trackPaymentPlan(paymentPlan.name);

    cy.filterPaymentPlans({ code: paymentPlan.code });
    cy.assertPaymentPlanRowVisible(paymentPlan);

    cy.openPaymentPlanForEditFromList(paymentPlan.code);
    cy.assertMuiInput('Code', paymentPlan.code);
    cy.assertMuiInput('Name', paymentPlan.name);
    cy.assertMuiInput('Valid from', paymentPlan.dateValidFrom);
  });

  it('blocks save when the code is changed to a duplicate value', () => {
    const existingPlan = planData('Duplicate Base', individualProgramName);
    const duplicateCandidate = planData('Duplicate Candidate', individualProgramName);

    cy.createPaymentPlan(existingPlan);
    trackPaymentPlan(existingPlan.name);

    cy.openCreatePaymentPlan();
    // type must be provided: the form only renders Code/Name/etc. after a type is selected.
    // calculationRule is intentionally omitted (undefined → first available rule is selected)
    // so that all mandatory fields are filled and the save button is enabled.
    cy.fillPaymentPlanForm({ ...duplicateCandidate, type: 'Benefit Plan' });
    cy.get('[title="Save changes"] button').should('not.be.disabled');

    cy.enterMuiInput('Code', existingPlan.code);
    cy.get('[title="Save changes"] button').should('be.disabled');
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
    cy.contains('Educated level').should('exist');
    cy.contains('Contains').should('exist');
    cy.contains('prim').should('exist');
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

  it('edits an existing payment plan', () => {
    const paymentPlan = planData('Edit', individualProgramName);
    const updatedName = `${paymentPlan.name} Updated`;
    const updatedDateValidTo = getDateOffset(60);

    cy.createPaymentPlan(paymentPlan);
    trackPaymentPlan(updatedName);

    cy.openPaymentPlanForEditFromList(paymentPlan.code);
    cy.enterMuiInput('Name', updatedName);
    cy.enterDateInput('Valid to', updatedDateValidTo);
    cy.savePaymentPlan();

    createdPaymentPlans.delete(paymentPlan.name);

    cy.filterPaymentPlans({ code: paymentPlan.code });
    cy.assertPaymentPlanRowVisible({ code: paymentPlan.code, name: updatedName });

    cy.openPaymentPlanForEditFromList(paymentPlan.code);
    cy.assertMuiInput('Name', updatedName);
    cy.assertMuiInput('Valid to', updatedDateValidTo);
  });

  it('adds a new version of a payment plan', () => {
    const paymentPlan = planData('Version Base', individualProgramName);
    const replacementName = `${paymentPlan.name} V2`;

    cy.createPaymentPlan(paymentPlan);
    trackPaymentPlan(paymentPlan.name);
    trackPaymentPlan(replacementName);

    cy.replacePaymentPlanFromList(paymentPlan.code);
    cy.enterMuiInput('Name', replacementName);
    // Use today so V2 satisfies the default validity filter (dateValidFrom <= today).
    cy.enterDateInput('Valid from', getDateOffset(0));
    cy.savePaymentPlan();

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

    cy.filterPaymentPlans({ name: paymentPlan.name, showDeleted: true });
    cy.assertPaymentPlanRowVisible({ name: paymentPlan.name });
  });

  it('creates a benefit-plan payment plan for a group-profile program', () => {
    const paymentPlan = planData('Group Smoke', groupProgramName);

    cy.createPaymentPlan(paymentPlan);
    trackPaymentPlan(paymentPlan.name);

    cy.filterPaymentPlans({ code: paymentPlan.code });
    cy.assertPaymentPlanRowVisible(paymentPlan);
  });
});
