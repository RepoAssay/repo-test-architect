/**
 * Locale-independent string ordering, so artifact order is identical on every machine
 * regardless of ICU data or the user's locale (unlike String#localeCompare). Compares
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
