/**
 * Converts free-form text into a URL-safe, lowercase, hyphen-separated slug.
 * Used as the default slug when a client creates a category/product without
 * supplying one explicitly.
 */
export const slugify = (value: string): string => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};
