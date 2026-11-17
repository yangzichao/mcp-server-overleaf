import type { OverleafWebClient } from "./overleafWebClient.js";

/**
 * The project as a ZIP archive: `GET /Project/:id/download/zip`, served by
 * `ProjectDownloadsController.downloadProject`. It holds the current content in Overleaf,
 * binary files included, not anything waiting in the local clone.
 */
export async function downloadProjectArchive(
  client: OverleafWebClient,
  overleafProjectId: string,
): Promise<Buffer> {
  return (await client.download(`/Project/${overleafProjectId}/download/zip`, { timeoutMs: 300_000 })).bytes;
}
