import { RequestNotSentError } from "./overleafWebErrors.js";

/**
 * Ids go into request paths, so each is checked before it is sent: Overleaf validates project,
 * folder, document, file and tag ids as Mongo ObjectIds (`zz.objectId()`), and anything else
 * could change which route a request reaches.
 */

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;
const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function isOverleafId(value: string): boolean {
  return OBJECT_ID_PATTERN.test(value);
}

export function requireOverleafId(value: string, description: string): string {
  if (!isOverleafId(value)) {
    throw new RequestNotSentError(
      `${description} "${value}" is not an Overleaf id (24 hexadecimal characters).`,
    );
  }
  return value;
}

/** For ids Overleaf does not document the format of, such as comment message ids. */
export function requireSafePathSegment(value: string, description: string): string {
  if (!PATH_SEGMENT_PATTERN.test(value)) {
    throw new RequestNotSentError(`${description} "${value}" is not an id Overleaf could have issued.`);
  }
  return value;
}
