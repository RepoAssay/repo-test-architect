/**
 * Locale-independent string ordering, so artifact order does not depend on the user's locale or
 * ICU collation data (unlike String#localeCompare). Lowercasing follows the runtime's Unicode
 * case mappings, so names using characters whose casing changed between Unicode versions may
 * still order differently across Node.js releases; ASCII and long-stable scripts do not. Compares
 * case-insensitively first, keeping the familiar "configure, routes, UserResponseDTO"
 * order, then by UTF-16 code unit so distinct strings never compare equal.
 *
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
export function compareText(left, right) {
  return compareCodeUnits(left.toLowerCase(), right.toLowerCase()) || compareCodeUnits(left, right);
}

function compareCodeUnits(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
