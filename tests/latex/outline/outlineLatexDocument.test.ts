import { describe, expect, it } from "vitest";

import { outlineLatexDocument } from "../../../src/latex/outline/outlineLatexDocument.js";
import { inMemoryProject } from "../support/inMemoryProject.js";

describe("outlineLatexDocument", () => {
  it("interleaves included files' headings at the point each is included", async () => {
    const project = inMemoryProject({
      "main.tex": [
        "\\begin{document}",
        "\\section{Introduction}",
        "\\input{sections/method}",
        "\\section{Results}",
        "\\include{sections/appendix}",
        "\\input{sections/missing}",
        "\\end{document}",
      ].join("\n"),
      "sections/method.tex": "\\section{Method}\n\\subsection{Data}\n",
      "sections/appendix.tex": "\\section{Appendix}\n",
    });
    const outline = await outlineLatexDocument(project, "main.tex");
    expect(outline.headings.map((heading) => `${heading.path}:${heading.section.title}`)).toEqual([
      "main.tex:Introduction",
      "sections/method.tex:Method",
      "sections/method.tex:Data",
      "main.tex:Results",
      "sections/appendix.tex:Appendix",
    ]);
    expect(outline.missingIncludes.map((missing) => missing.written)).toEqual(["\\input{sections/missing}"]);
  });
});
