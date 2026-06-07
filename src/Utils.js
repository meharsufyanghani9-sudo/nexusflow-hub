// utils.js — Shared utility functions.
//
// REFACTOR Phase-23/24: typeIcon was identically defined in both
// Transactions.js and ResellerEarnings.js. badgeClass was identically defined
// in BuyerDashboard.js, Orders.js, and ResellerDashboard.js.
// Both helpers now live here; all consumers import from this file.
// Adding a new transaction type or status now requires one edit, not five.

/**
 * Returns an emoji icon for a transaction type.
 * @param {string} type - Transaction type string from the DB.
 * @returns {string} Emoji character.
 */
export function typeIcon(type) {
  if (type === 'deposit')    return '💳';
  if (type === 'order')      return '📦';
  if (type === 'refund')     return '↩️';
  if (type === 'referral')   return '🎁';
  if (type === 'task')       return '⚡';
  if (type === 'withdrawal') return '💸';
  return '💸';
}

/**
 * Returns the CSS badge class name for an order/task status.
 * Maps to the .b-* classes defined in style.css.
 * @param {string} status - Status string from the DB.
 * @returns {string} CSS class name.
 */
export function badgeClass(status) {
  if (status === 'completed')   return 'b-completed';
  if (status === 'in_progress') return 'b-processing';
  if (status === 'pending')     return 'b-pending';
  return 'b-rejected';
}
