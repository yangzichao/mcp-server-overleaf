const requestTimeoutMilliseconds = 15_000;

const npmWeeklyDownloadsUrl = "https://api.npmjs.org/downloads/point/last-week/mcp-server-overleaf";
const glamaScoreBadgeUrl = "https://glama.ai/mcp/servers/yangzichao/mcp-server-overleaf/badges/score.svg";

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(requestTimeoutMilliseconds) });
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }
  return response.text();
}

function formatDownloadCount(downloadCount) {
  if (downloadCount < 1000) {
    return String(downloadCount);
  }
  return `${(downloadCount / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

export async function fetchNpmWeeklyDownloads() {
  const { downloads } = JSON.parse(await fetchText(npmWeeklyDownloadsUrl));
  if (!Number.isInteger(downloads)) {
    throw new Error(`npm returned no download count: ${downloads}`);
  }
  return formatDownloadCount(downloads);
}

export async function fetchGlamaRating() {
  const badgeSvg = await fetchText(glamaScoreBadgeUrl);
  const ratingMatch = /rated ([A-F][+-]?) on Glama/.exec(badgeSvg);
  if (!ratingMatch) {
    throw new Error("the Glama score badge no longer says 'rated <grade> on Glama'");
  }
  return ratingMatch[1];
}
