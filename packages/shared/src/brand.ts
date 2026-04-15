/**
 * Nominal typing helper for TypeScript's structural type system.
 *
 * - Prefer for IDs and value-object-like primitives (e.g. UserId vs PostId).
 * - Compile-time only: brands are erased at runtime.
 */
export type Brand<Tag extends string> = { readonly __brand: Tag };

export type Branded<T, Tag extends string> = T & Brand<Tag>;
