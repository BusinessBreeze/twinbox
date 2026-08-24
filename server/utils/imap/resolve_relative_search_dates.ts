/**
 * Maps relative date search keys to their corresponding standard IMAP date search keys.
 */
const RELATIVE_DATE_MAP: Record<string, string> = {
  _since_days: 'since',
  _before_days: 'before',
  _on_days: 'on',
  _sentSince_days: 'sentSince',
  _sentBefore_days: 'sentBefore',
  _sentOn_days: 'sentOn'
};

/**
 * Recursively resolves relative date search criteria (e.g. _since_days: 7)
 * into standard IMAP date search criteria (e.g. since: Date object 7 days ago).
 */
export function resolveRelativeSearchDates(criteria: any): any {
  if (!criteria || typeof criteria !== 'object') {
    return criteria;
  }

  if (Array.isArray(criteria)) {
    return criteria.map(item => resolveRelativeSearchDates(item));
  }

  const resolved: Record<string, any> = {};

  for (const [key, value] of Object.entries(criteria)) {
    if (RELATIVE_DATE_MAP[key]) {
      const targetKey = RELATIVE_DATE_MAP[key];
      const days = typeof value === 'number' ? value : parseInt(String(value), 10);
      if (!isNaN(days)) {
        // Calculate date N days ago
        const targetDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        resolved[targetKey] = targetDate;
      } else {
        resolved[key] = value;
      }
    } else if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
      resolved[key] = resolveRelativeSearchDates(value);
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}
