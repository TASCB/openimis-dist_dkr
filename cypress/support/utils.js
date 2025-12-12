export function getProgramTerm({ capitalize = false, plural = false } = {}) {
  let term = Cypress.env('useSocialProtectionLanguagePack') ? 'program' : 'benefit plan';

  if (plural) {
    term = term + 's';
  }

  if (capitalize) {
    term = capitalizeWords(term);
  }

  return term;
}

export function capitalizeWords(str) {
  return str.replace(/\b\w/g, char => char.toUpperCase());
}

export function getTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
