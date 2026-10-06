/**
 * Generates a unique name by appending an incrementing index `(1)`, `(2)`, etc.
 * if the base name already exists in the provided list of existing names.
 *
 * @param name The desired base name
 * @param existingNames Array of existing names to check against
 * @returns An available unique name string
 */
export function getUniqueName(name: string, existingNames: (string | null | undefined)[]): string {
  const cleanName = (name || '').trim();
  const set = new Set(
    existingNames
      .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
      .map(n => n.trim().toLowerCase())
  );

  if (!set.has(cleanName.toLowerCase())) {
    return cleanName;
  }

  let index = 1;
  while (true) {
    const candidate = `${cleanName} (${index})`;
    if (!set.has(candidate.toLowerCase())) {
      return candidate;
    }
    index++;
  }
}
