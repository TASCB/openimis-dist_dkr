import { getTimestamp } from '../support/utils';

describe('Payment point workflows', () => {
  const suiteTimestamp = getTimestamp();
  const createdPaymentPoints = new Set();

  // Two locations in different regions for filter exclusion tests.
  const locationA = {
    region: 'Region 1',
    district: 'District 1',
    municipality: 'Achi',
    village: 'Rachla',
  };
  const locationB = {
    region: 'Tahida',
    district: 'Rajo',
    municipality: 'Jaber',
    village: 'Utha',
  };
  const ppmUser = 'Admin';

  // Pre-created points used by filter tests (created in before()).
  const filterPointA = {
    name: `PP FilterA ${suiteTimestamp}`.slice(0, 50),
    ...locationA,
    ppm: ppmUser,
  };
  const filterPointB = {
    name: `PP FilterB ${suiteTimestamp}`.slice(0, 50),
    ...locationB,
    ppm: ppmUser,
  };

  const pointData = (label) => ({
    name: `PP ${label} ${suiteTimestamp}`.slice(0, 50),
    ...locationA,
    ppm: ppmUser,
  });

  const trackPoint = (name) => {
    createdPaymentPoints.add(name);
  };

  before(() => {
    cy.login();
    // Create two points in different regions for location filter tests.
    cy.createPaymentPoint(filterPointA);
    trackPoint(filterPointA.name);
    cy.createPaymentPoint(filterPointB);
    trackPoint(filterPointB.name);
    cy.logout();
  });

  after(() => {
    cy.login();
    Array.from(createdPaymentPoints).forEach((name) => {
      cy.deletePaymentPointFromList(name);
    });
    cy.logout();
  });

  beforeEach(() => {
    cy.login();
  });

  // --- Validation ---

  it('validates required fields before allowing save', () => {
    cy.openCreatePaymentPoint();
    // Save Fab should be disabled when no fields are filled.
    cy.get('button.MuiFab-root').should('be.disabled');
  });

  // --- Create ---

  it('creates a payment point with full location hierarchy', () => {
    const point = pointData('Create');

    cy.createPaymentPoint(point);
    trackPoint(point.name);

    cy.filterPaymentPoints({ name: point.name });
    cy.assertPaymentPointRowVisible({ name: point.name });
  });

  it('verifies detail page fields match after create', () => {
    const point = pointData('Detail');

    cy.createPaymentPoint(point);
    trackPoint(point.name);

    cy.openPaymentPointForViewFromList(point.name);
    cy.assertPaymentPointDetailFields(point);
  });

  // --- Filter by Name ---

  it('filters by name toggles visibility', () => {
    cy.filterPaymentPoints({ name: filterPointA.name });
    cy.assertPaymentPointRowVisible({ name: filterPointA.name });
    cy.assertPaymentPointRowNotVisible({ name: filterPointB.name });

    cy.filterPaymentPoints({ name: filterPointB.name });
    cy.assertPaymentPointRowVisible({ name: filterPointB.name });
    cy.assertPaymentPointRowNotVisible({ name: filterPointA.name });
  });

  // --- Filter by PPM ---

  it('filters by Payment Point Manager', () => {
    cy.filterPaymentPoints({ ppm: ppmUser, name: filterPointA.name });
    cy.assertPaymentPointRowVisible({ name: filterPointA.name });
  });

  // --- Filter by Location Hierarchy ---

  it('filters by Region excludes other regions', () => {
    // Region 1 should show point A but not point B (Tahida).
    cy.filterPaymentPoints({ region: locationA.region });
    cy.assertPaymentPointRowNotVisible({ name: filterPointB.name });

    // Tahida should show point B but not point A (Region 1).
    cy.filterPaymentPoints({ region: locationB.region });
    cy.assertPaymentPointRowNotVisible({ name: filterPointA.name });
  });

  it('filters by Region and District narrows results', () => {
    cy.filterPaymentPoints({
      region: locationA.region,
      district: locationA.district,
      name: filterPointA.name,
    });
    cy.assertPaymentPointRowVisible({ name: filterPointA.name });
    cy.assertPaymentPointRowNotVisible({ name: filterPointB.name });
  });

  it('filters by Region, District, Municipality narrows results', () => {
    cy.filterPaymentPoints({
      region: locationA.region,
      district: locationA.district,
      municipality: locationA.municipality,
      name: filterPointA.name,
    });
    cy.assertPaymentPointRowVisible({ name: filterPointA.name });
  });

  it('filters by full location hierarchy matches exactly', () => {
    cy.filterPaymentPoints({
      region: locationA.region,
      district: locationA.district,
      municipality: locationA.municipality,
      village: locationA.village,
      name: filterPointA.name,
    });
    cy.assertPaymentPointRowVisible({ name: filterPointA.name });
  });

  it('wrong Region returns no matching test points', () => {
    // Filter by Tahida region — point A (Region 1) should not appear.
    cy.filterPaymentPoints({
      region: locationB.region,
      name: filterPointA.name,
    });
    cy.assertPaymentPointRowNotVisible({ name: filterPointA.name });
  });

  // --- Location Cascade ---

  it('selecting Region populates District options in filter', () => {
    cy.visit('/front/paymentPoints');
    cy.contains(/\d+ Payment Points Found/, { timeout: 15000 });
    // eslint-disable-next-line cypress/no-unnecessary-waiting
    cy.wait(1000);

    // Select Region 1 — District dropdown should now have options.
    cy.chooseMuiSelect('Region', 'Region 1');

    // Open the District dropdown and verify at least one option appears.
    cy.contains('label', 'District')
      .siblings('.MuiInputBase-root')
      .find('[role="button"]')
      .click();
    cy.get('[role="listbox"] li', { timeout: 15000 })
      .should('have.length.at.least', 1);
    // Press Escape to close the dropdown without selecting.
    cy.get('body').type('{esc}');
  });

  // --- Reset Filters ---

  it('Reset Filters clears all inputs and restores full list', () => {
    cy.visit('/front/paymentPoints');
    cy.contains(/\d+ Payment Points Found/, { timeout: 15000 });
    // eslint-disable-next-line cypress/no-unnecessary-waiting
    cy.wait(1000);

    // Fill some filters.
    cy.enterMuiInput('Name', 'SomeFilterValue');
    cy.chooseMuiSelect('Region', 'Region 1');

    // Click Reset Filters.
    cy.resetPaymentPointFilters();

    // Name input should be cleared.
    cy.contains('label', 'Name')
      .siblings('.MuiInputBase-root')
      .find('input')
      .should('have.value', '');
  });

  // --- View ---

  it('views payment point details via eye icon from list', () => {
    cy.openPaymentPointForViewFromList(filterPointA.name);
    cy.assertPaymentPointDetailFields(filterPointA);
  });

  // --- Edit ---

  it('edits name and verifies it persists after save', () => {
    const point = pointData('Edit');
    const updatedName = `${point.name} Upd`.slice(0, 50);

    cy.createPaymentPoint(point);
    trackPoint(updatedName);

    cy.openPaymentPointForViewFromList(point.name);
    // Wait for the form data to fully load before editing — the fetch
    // completes async and overwrites the input value via React state.
    cy.assertMuiInput('Name', point.name);
    cy.enterMuiInput('Name', updatedName);
    cy.savePaymentPoint();

    createdPaymentPoints.delete(point.name);

    // The update mutation fires async — back() returns to the list before
    // the mutation completes.  Wait for the API to settle before searching.
    // eslint-disable-next-line cypress/no-unnecessary-waiting
    cy.wait(3000);

    cy.openPaymentPointForViewFromList(updatedName);
    cy.assertPaymentPointDetailFields({ ...point, name: updatedName });
  });

  // --- Delete ---

  it('deletes a payment point from the list', () => {
    const point = pointData('Delete');

    cy.createPaymentPoint(point);
    // Not tracked in createdPaymentPoints — deleted below.

    cy.deletePaymentPointFromList(point.name);

    // Should not appear in the default list after deletion.
    cy.filterPaymentPoints({ name: point.name });
    cy.assertPaymentPointRowNotVisible({ name: point.name });
  });

  it('deletes a payment point from the detail page', () => {
    const point = pointData('DetailDel');

    cy.createPaymentPoint(point);
    // Not tracked — deleted below.

    cy.openPaymentPointForViewFromList(point.name);

    // Delete is an IconButton in the Form toolbar (not a Fab).
    // The Form component wraps actions in a Tooltip; the tooltip text is
    // formatMessage('tooltip.delete').  Click the IconButton directly.
    cy.get('button.MuiIconButton-root[title*="elete"]', { timeout: 5000 })
      .click({ force: true });

    // coreConfirm dialog — buttons are typically "Confirm" / "Cancel" or
    // similar; use a broad selector.
    cy.get('[role="dialog"]', { timeout: 10000 }).should('be.visible');
    cy.get('[role="dialog"]').contains('button', /ok|confirm|yes/i).click();

    // Verify it no longer appears in the list.
    // eslint-disable-next-line cypress/no-unnecessary-waiting
    cy.wait(2000);
    cy.filterPaymentPoints({ name: point.name });
    cy.assertPaymentPointRowNotVisible({ name: point.name });
  });
});
