/** Check if the current cashier holds a permission slug (owner bypass is server-side). */
export function hasPosPermission(permissions: string[], slug: string): boolean {
  return permissions.includes(slug);
}
