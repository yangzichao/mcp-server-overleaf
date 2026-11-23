import { expect } from "vitest";

import type { TextChangeOperation } from "../../../../src/overleaf/realtime/textChanges/textChangeOperations.js";

/** Applies operations one after another, each against the text the previous one left, as Overleaf does. */
export function applyOperationsInOrder(text: string, operations: readonly TextChangeOperation[]): string {
  let current = text;
  for (const operation of operations) {
    expect(operation.p).toBeGreaterThanOrEqual(0);
    expect(operation.p).toBeLessThanOrEqual(current.length);
    if ("d" in operation) {
      expect(current.slice(operation.p, operation.p + operation.d.length)).toBe(operation.d);
      current = current.slice(0, operation.p) + current.slice(operation.p + operation.d.length);
    } else {
      current = current.slice(0, operation.p) + operation.i + current.slice(operation.p);
    }
  }
  return current;
}
