/**
 * Join CSS class names, filtering out falsy values
 */
export function classNames(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Parse CSS module styles into regular class names
 * @param styles CSS module styles object
 * @param classNames Array of class names to parse
 * @returns Space-separated string of CSS module class names
 */
export function cssModule(styles: Record<string, string>, classNames: string[]): string {
  return classNames
    .map(className => styles[className])
    .filter(Boolean)
    .join(" ");
}

/**
 * Parse CSS module conditional classes
 * @param styles CSS module styles object
 * @param classes Object with class names as keys and conditions as values
 * @returns Space-separated string of CSS module class names
 */
export function cssModuleCondition(
  styles: Record<string, string>,
  classes: Record<string, boolean | undefined>
): string {
  return Object.entries(classes)
    .filter(([_, condition]) => condition)
    .map(([className]) => styles[className])
    .filter(Boolean)
    .join(" ");
}

/**
 * Convert kebab-case to camelCase
 */
export function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, g => g[1].toUpperCase());
}

/**
 * Convert camelCase to kebab-case
 */
export function camelToKebab(str: string): string {
  return str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, "$1-$2").toLowerCase();
}
