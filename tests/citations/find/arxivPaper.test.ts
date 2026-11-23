import { describe, expect, it } from "vitest";

import { arxivPaperEntry } from "../../../src/citations/find/arxiv/arxivPaperEntry.js";
import { parseArxivPaper } from "../../../src/citations/find/arxiv/parseArxivPaper.js";
import { formatBibtexEntry } from "../../../src/citations/find/bibtex/bibtexEntry.js";
import { citationKeyStem } from "../../../src/citations/find/keys/citationKeyStem.js";

/** The arXiv API's answer for id_list=1706.03762, cut to two authors and without the abstract. */
const ATTENTION_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="html">ArXiv Query: search_query=&amp;id_list=1706.03762&amp;start=0&amp;max_results=10</title>
  <id>http://arxiv.org/api/cHxbiOdZaP56ODnBPIenZhzg5f8</id>
  <entry>
    <id>http://arxiv.org/abs/1706.03762v7</id>
    <updated>2023-08-02T00:41:18Z</updated>
    <published>2017-06-12T17:57:34Z</published>
    <title>Attention Is All
  You Need</title>
    <summary>  The dominant sequence transduction models are based on complex recurrent networks.</summary>
    <author>
      <name>Ashish Vaswani</name>
    </author>
    <author>
      <name>&#321;ukasz Kaiser</name>
    </author>
    <arxiv:comment xmlns:arxiv="http://arxiv.org/schemas/atom">15 pages, 5 figures</arxiv:comment>
    <link href="http://arxiv.org/abs/1706.03762v7" rel="alternate" type="text/html"/>
    <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
</feed>`;

/** An old-style id with the published version's DOI and journal reference. */
const MALDACENA_ENTRY = `<feed xmlns="http://www.w3.org/2005/Atom"><entry>
  <id>http://arxiv.org/abs/hep-th/9711200v3</id>
  <published>1997-11-27T21:11:41Z</published>
  <title>The Large N Limit of Superconformal Field Theories and Supergravity</title>
  <author><name>Juan M. Maldacena</name></author>
  <arxiv:doi xmlns:arxiv="http://arxiv.org/schemas/atom">10.1023/A:1026654312961</arxiv:doi>
  <arxiv:journal_ref xmlns:arxiv="http://arxiv.org/schemas/atom">Adv.Theor.Math.Phys.2:231-252,1998</arxiv:journal_ref>
  <category term="hep-th" scheme="http://arxiv.org/schemas/atom"/>
</entry></feed>`;

describe("parseArxivPaper", () => {
  it("reads the entry, not the feed around it", () => {
    expect(parseArxivPaper(ATTENTION_FEED)).toEqual({
      kind: "paper",
      paper: {
        versionedId: "1706.03762v7",
        title: "Attention Is All You Need",
        authorNames: ["Ashish Vaswani", "Łukasz Kaiser"],
        published: "2017-06-12T17:57:34Z",
        primaryCategory: "cs.CL",
        doi: undefined,
        journalReference: undefined,
      },
    });
  });

  it("falls back to the first category and reads the DOI and journal reference", () => {
    const answer = parseArxivPaper(MALDACENA_ENTRY);
    expect(answer.kind === "paper" && answer.paper).toMatchObject({
      versionedId: "hep-th/9711200v3",
      primaryCategory: "hep-th",
      doi: "10.1023/A:1026654312961",
      journalReference: "Adv.Theor.Math.Phys.2:231-252,1998",
    });
  });

  it("tells an error entry and an empty feed apart", () => {
    const error = `<feed><entry><id>http://arxiv.org/api/errors#incorrect_id_format_for_1234</id><title>Error</title><summary>incorrect id format for 1234</summary></entry></feed>`;
    expect(parseArxivPaper(error)).toEqual({ kind: "error", summary: "incorrect id format for 1234" });
    expect(parseArxivPaper("<feed><title>ArXiv Query</title></feed>")).toEqual({ kind: "none" });
    expect(
      parseArxivPaper("<feed><entry><id>http://arxiv.org/abs/0000.00000</id><title></title></entry></feed>"),
    ).toEqual({
      kind: "none",
    });
  });
});

describe("arxivPaperEntry", () => {
  function written(feed: string, requestedId: string): string {
    const answer = parseArxivPaper(feed);
    if (answer.kind !== "paper") throw new Error("no paper");
    const draft = arxivPaperEntry(answer.paper, requestedId);
    return formatBibtexEntry({ ...draft, key: citationKeyStem(draft) });
  }

  it("writes @misc with eprint, archivePrefix and primaryClass, and the first version's year", () => {
    expect(written(ATTENTION_FEED, "1706.03762")).toBe(
      [
        "@misc{vaswani2017attention,",
        "  author = {Ashish Vaswani and Łukasz Kaiser},",
        "  title = {Attention Is All You Need},",
        "  year = {2017},",
        "  eprint = {1706.03762},",
        "  archivePrefix = {arXiv},",
        "  primaryClass = {cs.CL},",
        "  url = {https://arxiv.org/abs/1706.03762}",
        "}",
      ].join("\n"),
    );
  });

  it("cites the version asked for, and keeps the journal reference and DOI", () => {
    expect(written(MALDACENA_ENTRY, "hep-th/9711200v2")).toBe(
      [
        "@misc{maldacena1997large,",
        "  author = {Juan M. Maldacena},",
        "  title = {The Large N Limit of Superconformal Field Theories and Supergravity},",
        "  year = {1997},",
        "  doi = {10.1023/A:1026654312961},",
        "  eprint = {hep-th/9711200v2},",
        "  archivePrefix = {arXiv},",
        "  primaryClass = {hep-th},",
        "  url = {https://arxiv.org/abs/hep-th/9711200v2},",
        "  note = {Adv.Theor.Math.Phys.2:231-252,1998}",
        "}",
      ].join("\n"),
    );
  });
});
