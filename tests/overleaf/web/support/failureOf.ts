/** The error a call rejects with; fails the test when the call succeeds instead. */
export async function failureOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error(`The call rejected with something other than an Error: ${String(error)}`);
  }
  throw new Error("Expected the call to fail, but it succeeded.");
}

/** The HTTP status an `OverleafWebRequestError` carries, or undefined for any other error. */
export function statusOf(error: Error): number | undefined {
  return "status" in error && typeof error.status === "number" ? error.status : undefined;
}
