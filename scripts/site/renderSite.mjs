// Builds the GitHub Pages site into _site/: the files in site/, the two images it shows
// from docs/assets/, the README as llms-full.txt, and live npm and Glama numbers.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchGlamaRating, fetchNpmWeeklyDownloads } from "./fetchProjectStats.mjs";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const siteSourceFolder = join(repositoryRoot, "site");
const siteOutputFolder = join(repositoryRoot, "_site");
const imagesShownOnSite = [
  "collaborator-safety-demo.gif",
  "collaborator-safety-demo.png",
  "social-preview.png",
];

async function renderHomePage() {
  const [npmWeeklyDownloads, glamaRating] = await Promise.all([
    fetchNpmWeeklyDownloads(),
    fetchGlamaRating(),
  ]);
  const homePageTemplate = await readFile(join(siteSourceFolder, "index.html"), "utf8");
  const homePage = homePageTemplate
    .replaceAll("{{npmWeeklyDownloads}}", npmWeeklyDownloads)
    .replaceAll("{{glamaRating}}", glamaRating);
  if (/\{\{\w+\}\}/.test(homePage)) {
    throw new Error("site/index.html still has an unfilled {{placeholder}}");
  }
  await writeFile(join(siteOutputFolder, "index.html"), homePage);
}

await rm(siteOutputFolder, { recursive: true, force: true });
await cp(siteSourceFolder, siteOutputFolder, { recursive: true });
await mkdir(join(siteOutputFolder, "assets"), { recursive: true });
for (const imageName of imagesShownOnSite) {
  await cp(join(repositoryRoot, "docs/assets", imageName), join(siteOutputFolder, "assets", imageName));
}
await cp(join(repositoryRoot, "README.md"), join(siteOutputFolder, "llms-full.txt"));
await renderHomePage();
