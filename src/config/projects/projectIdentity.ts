const OVERLEAF_PROJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

export function looksLikeOverleafProjectId(candidate: string): boolean {
  return OVERLEAF_PROJECT_ID_PATTERN.test(candidate.trim());
}
