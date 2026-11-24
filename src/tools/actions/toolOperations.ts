import type { ToolTextResult } from "../toolContext.js";

/**
 * One action or view of a tool that does several related things: the arguments it reads,
 * beyond the ones every operation of that tool shares, and the work itself.
 */
export interface ToolOperation<Arguments> {
  readonly uses: readonly (keyof Arguments & string)[];
  readonly run: (input: Arguments) => Promise<ToolTextResult>;
}

/**
 * Runs the operation a call selected, after refusing any argument that operation does not read.
 *
 * A model that passes findText along with action "write" has misread the tool. Ignoring the
 * argument would let the misreading stand, so the call fails and names the operations that
 * do take it.
 */
export function runSelectedOperation<Name extends string, Arguments extends object>(
  selected: Name,
  operations: Readonly<Record<Name, ToolOperation<Arguments>>>,
  input: Arguments,
  sharedArguments: readonly (keyof Arguments & string)[],
): Promise<ToolTextResult> {
  const operation = operations[selected];
  const shared: readonly string[] = sharedArguments;
  for (const [name, value] of Object.entries(input)) {
    if (
      value === undefined ||
      shared.includes(name) ||
      (operation.uses as readonly string[]).includes(name)
    ) {
      continue;
    }
    const users = (Object.entries(operations) as [string, ToolOperation<Arguments>][])
      .filter(([, candidate]) => (candidate.uses as readonly string[]).includes(name))
      .map(([operationName]) => operationName);
    const usedBy = users.length > 0 ? `; ${joinAsList(users)} ${users.length === 1 ? "uses" : "use"} it` : "";
    throw new Error(`${name} does not apply to ${selected}${usedBy}.`);
  }
  return operation.run(input);
}

/** "a", "a and b", "a, b and c". */
function joinAsList(items: readonly string[]): string {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** An argument the chosen operation cannot run without. */
export function requireArgument<T>(value: T | undefined, name: string, operationName: string): T {
  if (value === undefined) throw new Error(`${operationName} needs ${name}.`);
  return value;
}
