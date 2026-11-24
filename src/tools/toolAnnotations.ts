/**
 * The behavioural hints every tool declares, in one place so the set stays consistent.
 *
 * `openWorldHint` is the one most easily got wrong here. Almost every tool in this server
 * contacts Overleaf: the read tools pull before they answer, so they reach a system whose
 * contents this server does not control. Only `list_projects` can be closed: without a session
 * cookie it reports what the local configuration holds and opens no connection.
 */

export interface OverleafToolAnnotations {
  readonly readOnlyHint: boolean;
  readonly destructiveHint?: boolean;
  readonly idempotentHint?: boolean;
  readonly openWorldHint: boolean;
}

/** Reads Overleaf without changing it. Pulling into the local clone is not a change to the paper. */
export const READS_OVERLEAF: OverleafToolAnnotations = {
  readOnlyHint: true,
  openWorldHint: true,
};

/** Reads only this server's own configuration; contacts nothing. */
export const READS_LOCAL_CONFIGURATION: OverleafToolAnnotations = {
  readOnlyHint: true,
  openWorldHint: false,
};

/**
 * Edits the local clone. Destructive because it replaces text a co-author may have written,
 * and the result is not reversible from inside this server once `push_changes` has run.
 */
export const EDITS_LOCAL_CLONE: OverleafToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

/** Publishes to Overleaf, where collaborators see the result immediately. */
export const WRITES_TO_OVERLEAF: OverleafToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};
