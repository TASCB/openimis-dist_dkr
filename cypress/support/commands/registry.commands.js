export function registerRegistryCommands() {
  Cypress.Commands.add('uploadIndividualsCSV', (numIndividuals) => {
    cy.task('updateCSV', { numIndividuals }).then(() => {
      cy.contains('li', 'UPLOAD').click();

      cy.get('input[type="file"]').attachFile('tmp_individuals.csv');

      cy.chooseMuiSelect('Workflow', 'Python Import Individuals');
      cy.contains('button', 'Upload Individuals').click();

      cy.contains('button', 'Upload Individuals').should('not.exist');
      cy.contains('button', 'Uploading...').should('be.disabled');
    });
  });

  Cypress.Commands.add('ensureSufficientIndividuals', (expectedNumIndividuals) => {
    cy.visit('/front/individuals');
    cy.getItemCount('Individual').then((count) => {
      const numToAdd = expectedNumIndividuals - count;
      if (numToAdd <= 0) {
        Cypress.log({
          name: 'ensureSufficientIndividuals',
          message: `Found ${count} which is more than ${expectedNumIndividuals}, no need to add additional`,
        });
        return;
      }

      cy.visit('/front/individuals');
      cy.uploadIndividualsCSV(numToAdd);

      cy.wait(100 * numToAdd); // group creation takes time

      cy.visit('/front/individuals');
      cy.getItemCount('Individual').then((newCount) => {
        expect(newCount).to.be.gte(expectedNumIndividuals);
      });
    });
  });

  Cypress.Commands.add('ensureSufficientHouseholds', (expectedNumGroups) => {
    cy.visit('/front/groups');
    cy.getItemCount('Group').then((numGroups) => {
      const numGroupsToAdd = expectedNumGroups - numGroups;
      if (numGroupsToAdd <= 0) {
        Cypress.log({
          name: 'ensureSufficientHouseholds',
          message: `Found ${numGroups} which is more than ${expectedNumGroups}, no need to add additional`,
        });
        return;
      }

      const numIndividualsToAdd = numGroupsToAdd * 5;
      cy.visit('/front/individuals');
      cy.uploadIndividualsCSV(numIndividualsToAdd);

      cy.wait(100 * numIndividualsToAdd); // group creation takes time

      cy.visit('/front/groups');
      cy.getItemCount('Group').then((newCount) => {
        expect(newCount).to.be.gte(expectedNumGroups);
      });
    });
  });

  Cypress.Commands.add('getItemCount', (itemName) => {
    const pattern = new RegExp(`\\d+ ${itemName}s? Found`);
    return cy.contains(pattern)
      .invoke('text')
      .then((text) => {
        const match = text.match(new RegExp(`(\\d+)\\s+${itemName}`));
        return parseInt(match?.[1], 10);
      });
  });
}
