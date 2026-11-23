import type { FakeMetadataServices } from "../../integration/fakeMetadataServices.js";
import type { PublishedFile } from "./connectedOverleafProject.js";

/** Six cited entries, one cited key with no entry, and one entry nobody cites. */
export const paperWithCitations: readonly PublishedFile[] = [
  {
    path: "main.tex",
    content: [
      "\\begin{document}",
      "\\cite{real2017,wrongdoi,fakedoi}",
      "\\citep{preprint,searched,madeup,missingkey}",
      "\\bibliography{refs}",
      "\\end{document}",
    ].join("\n"),
    commitMessage: "Draft",
  },
  {
    path: "refs.bib",
    content: [
      "@article{real2017, title = {Attention Is All You Need}, doi = {10.5555/real}}",
      "@article{wrongdoi, title = {Deep Residual Learning for Image Recognition}, doi = {10.5555/other}}",
      "@article{fakedoi, title = {A Paper Nobody Wrote}, doi = {10.5555/missing}}",
      "@misc{preprint, title = {Language Models are Few-Shot Learners}, eprint = {2005.14165}, archivePrefix = {arXiv}}",
      "@inproceedings{searched, title = {Generative Adversarial Nets}, author = {Goodfellow, Ian}, year = {2014}}",
      "@article{madeup, title = {Quantum Gravity Explained by Transformers}, author = {Nobody, A.}}",
      "@book{uncited, title = {Never Cited}, doi = {10.5555/uncited}}",
    ].join("\n"),
    commitMessage: "References",
  },
];

/** What doi.org, Crossref and arXiv know about those entries, as the fakes answer it. */
export function registerKnownWorks(metadata: FakeMetadataServices): void {
  metadata.dois.set("10.5555/real", { title: "Attention is all you need" });
  metadata.dois.set("10.5555/other", { title: "Protein structure prediction" });
  metadata.dois.set("10.5555/uncited", { title: "Never cited" });
  metadata.arxivPapers.set("2005.14165", { title: "Language Models are Few-Shot Learners" });
  metadata.searchResults = [
    {
      DOI: "10.5555/chapter",
      title: ["Quantum gravity explained"],
      author: [{ family: "Elsewhere", given: "A." }],
      issued: { "date-parts": [[2023]] },
    },
    { DOI: "10.5555/gan", title: ["Generative adversarial nets"], author: [{ family: "Goodfellow" }] },
  ];
}
