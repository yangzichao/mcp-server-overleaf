import * as z from "zod/v4";

import { COMMIT_HASH_PATTERN } from "../../overleaf/history/projectHistory.js";

/** A commit hash as list_history prints it; anything else is refused before Git sees it. */
export const revisionArgument = z
  .string()
  .regex(
    COMMIT_HASH_PATTERN,
    "A revision is a commit hash, 7 to 40 hexadecimal characters, as list_history prints it.",
  );

const ABSOLUTE_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
const RELATIVE_DATE_PATTERN = /^(?:\d{1,4} (?:minute|hour|day|week|month|year)s? ago|yesterday)$/;

/**
 * Git reads `--since` with its forgiving date parser, which silently ignores a date it cannot
 * make sense of and returns the whole history instead. Only forms it reads reliably get
 * through: a calendar date with an optional time, or "N days ago" and its relatives.
 */
export function isReliableHistoryDate(value: string): boolean {
  if (RELATIVE_DATE_PATTERN.test(value)) return true;
  const match = ABSOLUTE_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  // Date rolls 2026-02-31 over into March; a round trip catches it. Git stops at 2099.
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().startsWith(`${year}-${month}-${day}`) &&
    Number(year) >= 1970 &&
    Number(year) <= 2099
  );
}

export const historyDateArgument = z
  .string()
  .trim()
  .refine(
    isReliableHistoryDate,
    "Use a date such as 2026-11-01 or 2026-11-01 14:30, or a span such as 2 weeks ago.",
  );
