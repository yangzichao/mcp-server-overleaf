/**
 * How long one flattening of an input built to be slow may take. The linear code takes about
 * 200 milliseconds at most on an Apple silicon laptop and up to six times that on a CI runner;
 * the quadratic code it replaced took 4 to 10 seconds on the laptop for the same inputs.
 */
export const FLATTEN_TIME_BUDGET_MS = 3000;
