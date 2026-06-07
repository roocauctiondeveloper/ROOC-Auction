/**
 * Utility functions for date and time handling
 * Ensures all dates are formatted for Asia/Bangkok (UTC+7)
 */

/**
 * Formats a date string or object into a Thai locale string with Bangkok timezone
 * @param {Date|string|number} date - The date to format
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
function formatThaiDate(date, options = {}) {
  if (!date) return '';
  const d = new Date(date);
  
  const defaultOptions = {
    timeZone: 'Asia/Bangkok',
    locale: 'th-TH'
  };

  const finalOptions = { ...defaultOptions, ...options };
  const locale = finalOptions.locale;
  delete finalOptions.locale; // toLocaleString doesn't take locale in options object but as first arg

  return d.toLocaleString(locale, finalOptions);
}

/**
 * Formats a date in English with Bangkok timezone (for round names, liveboard etc.)
 */
function formatEnDate(date, options = {}) {
  if (!date) return '';
  const d = new Date(date);
  const finalOptions = { timeZone: 'Asia/Bangkok', ...options };
  return d.toLocaleString('en-GB', finalOptions);
}

/**
 * Formats a date string or object into a Thai locale time string with Bangkok timezone
 * @param {Date|string|number} date - The date to format
 * @returns {string} Formatted time string (HH:mm)
 */
function formatThaiTime(date) {
  return formatThaiDate(date, { 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: false 
  });
}

/**
 * Returns the current date in Asia/Bangkok as a string for naming rounds
 * @returns {string} Formatted current date string
 */
function getCurrentThaiDateTimeString() {
  return formatThaiDate(new Date(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

module.exports = {
  formatThaiDate,
  formatThaiTime,
  formatEnDate,
  getCurrentThaiDateTimeString
};
