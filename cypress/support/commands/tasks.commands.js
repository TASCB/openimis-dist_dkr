export function registerTaskCommands() {
  Cypress.Commands.add('ensurePermissiveTaskGroup', () => {
    cy.visit('/front/tasks/groups');

    cy.contains('Task Groups Found');
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

  // Ensure a task group for PaymentCycleService tasks exists.
  // When a task group has task_sources: ["PaymentCycleService"], any payment
  // cycle task is auto-assigned to this group with status ACCEPTED (instead of
  // staying RECEIVED with no group).  A group with status ACCEPTED can be
  // approved via the task management UI.
  Cypress.Commands.add('ensurePaymentCycleTaskGroup', () => {
    cy.visit('/front/tasks/groups');
    cy.contains('Task Groups Found', { timeout: 15000 });

    cy.get('table').then(($table) => {
      const hasGroup = $table.find('tbody tr td:first-child')
        .toArray()
        .some((td) => td.innerText.trim() === 'pc-cycles');

      if (!hasGroup) {
        cy.get('[title="Create"] button').click();

        cy.enterMuiInput('Code', 'pc-cycles');
        cy.chooseMuiSelect('Policy Status', 'ANY');
        // TaskExecutorsPicker.filterOptions checks username.includes(input).
        // 'Admin Admin' fails because the two-word string is longer than the
        // username alone.  Type the single token 'Admin' so the filter passes,
        // then cy.contains (substring match) still finds the 'Admin Admin' option.
        cy.chooseMuiAutocomplete('Task Executors', 'Admin');
        cy.chooseMuiAutocomplete('Task Sources', 'PaymentCycleService');

        cy.get('[title="Save changes"] button').click();

        // Wait for creation to complete
        cy.get('ul.MuiList-root li div[role="progressbar"]', { timeout: 15000 }).should('exist');

        // Verify creation in expanded journal drawer
        cy.get('.MuiDrawer-paperAnchorRight button').first().click();
        cy.get('ul.MuiList-root li').first().should('contain', 'Create task group');
      } else {
        cy.log('Payment Cycle task group (pc-cycles) already exists — skipping creation.');
      }
    });
  });

  // Approve the most recently created PaymentCycleService task.
  // Called in payroll.cy.js before() after cy.createPaymentCycle({ status: 'ACTIVE' })
  // to complete the maker-checker flow so the cycle becomes genuinely ACTIVE and
  // visible in the PaymentCyclePicker (which filters by status: ACTIVE).
  Cypress.Commands.add('approveLatestPaymentCycleTask', () => {
    cy.visit('/front/allTasks');
    // Searcher auto-fetches on mount; wait for the title to confirm results arrived.
    cy.contains('Tasks Found', { timeout: 15000 });

    // Table is ordered by -dateCreated (newest first).  The task we just
    // created is the most recent PaymentCycleService row.
    cy.contains('table tbody tr', 'PaymentCycleService', { timeout: 15000 })
      .first()
      .within(() => {
        cy.get('button.MuiIconButton-root').click({ force: true });
      });

    // Task detail page: /front/tasks/task/<uuid>
    cy.url({ timeout: 15000 }).should('include', '/tasks/task/');

    // The TaskApprovementPanel renders two Fabs (Approve / Fail) when the task
    // is ACCEPTED and the current user is in the task group.  The Form also
    // renders a Save Fab (disabled when canSave() is false).  Filter to the
    // first non-disabled Fab which is the Approve (CheckIcon) button.
    cy.get('button.MuiFab-root:not(.Mui-disabled)', { timeout: 15000 })
      .first()
      .click();

    // ConfirmDialog: "Are you sure you want to approve this task?" → Ok
    cy.contains('button', 'Ok', { timeout: 10000 }).click();

    // Wait for the dialog to close (mutation in flight)
    cy.get('[role="dialog"]', { timeout: 15000 }).should('not.exist');
  });
}
