/**
 * Generates a collision-resistant stable identifier with an optional domain prefix.
 */
export function createStableId(prefix: string): string {
  const randomPart =
    typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  return `${prefix}_${randomPart}`;
}
