/**
 * Allowed expense category labels (stored exactly as shown).
 * Savings rows use the same field; pick the closest fit (e.g. EMI, Others).
 */

const EXPENSE_CATEGORY_VALUES = Object.freeze([
  'EMI',
  'Others',
  'Bills and Utilities',
  'Rent',
  'Groceries',
  'Health and Medical',
  'Food Dining',
]);

const CANONICAL_SET = new Set(EXPENSE_CATEGORY_VALUES);

function normalizeKey(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/&/g, 'and');
}

/** Direct aliases (normalized key → canonical label). */
const ALIAS_TO_CANONICAL = new Map(
  [
    ['emi', 'EMI'],
    ['others', 'Others'],
    ['other', 'Others'],
    ['misc', 'Others'],
    ['miscellaneous', 'Others'],
    ['general', 'Others'],
    ['bills and utilities', 'Bills and Utilities'],
    ['utilities', 'Bills and Utilities'],
    ['rent', 'Rent'],
    ['groceries', 'Groceries'],
    ['grocery', 'Groceries'],
    ['health and medical', 'Health and Medical'],
    ['medical', 'Health and Medical'],
    ['health', 'Health and Medical'],
    ['food dining', 'Food Dining'],
    ['food and dining', 'Food Dining'],
    ['dining', 'Food Dining'],
    ['food', 'Food Dining'],
    ['loans and emi', 'EMI'],
    ['investment', 'EMI'],
    ['investments', 'EMI'],
    ['savings', 'Others'],
    ['personal care', 'Others'],
    ['entertainment', 'Others'],
    ['education', 'Others'],
    ['travel', 'Others'],
    ['transport', 'Others'],
    ['shopping', 'Others'],
  ].map(([k, v]) => [normalizeKey(k), v])
);

/**
 * Map legacy / free-text category to one of EXPENSE_CATEGORY_VALUES.
 */
function normalizeExpenseCategory(raw) {
  if (raw == null || String(raw).trim() === '') return 'Others';

  const trimmed = String(raw).trim();
  if (CANONICAL_SET.has(trimmed)) return trimmed;

  const key = normalizeKey(trimmed);
  if (ALIAS_TO_CANONICAL.has(key)) return ALIAS_TO_CANONICAL.get(key);

  const k = key.replace(/\band\b/g, '').replace(/\s+/g, ' ').trim();

  if (/\b(emi|loan|mf|sip|groww|installment|mutual|parag|nippon|autopay)\b/i.test(trimmed) || /emi/i.test(key))
    return 'EMI';
  if (/\b(rent|lease|landlord|housing)\b/i.test(trimmed)) return 'Rent';
  if (/\b(grocer|supermarket|ration|fresh)\b/i.test(trimmed)) return 'Groceries';
  if (/\b(bill|utility|electric|water|internet|broadband|mobile\s*plan|gas|cylinder)\b/i.test(trimmed))
    return 'Bills and Utilities';
  if (/\b(health|medical|doctor|pharma|hospital|clinic|medicine)\b/i.test(trimmed))
    return 'Health and Medical';
  if (/\b(food|dining|restaurant|swiggy|zomato|meal|lunch|dinner|breakfast|cafe)\b/i.test(trimmed))
    return 'Food Dining';

  return 'Others';
}

module.exports = {
  EXPENSE_CATEGORY_VALUES,
  CANONICAL_SET,
  normalizeExpenseCategory,
};
