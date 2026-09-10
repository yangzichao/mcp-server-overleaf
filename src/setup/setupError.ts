/**
 * A failure the person running `setup` can act on, printed without a stack trace.
 * Anything else that escapes is a defect and should keep its stack.
 */
export class SetupError extends Error {
  constructor(
    message: string,
    readonly remedy?: string,
  ) {
    super(message);
    this.name = "SetupError";
  }
}
