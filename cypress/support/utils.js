export function getProgramTerm() {
  return Cypress.env('useSocialProtectionLanguagePack') ? 'programme' : 'benefit plan';
}

export function capitalizeWords(str) {
  return str.replace(/\b\w/g, char => char.toUpperCase());
}
