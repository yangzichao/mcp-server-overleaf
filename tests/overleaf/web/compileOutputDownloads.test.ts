import { describe, expect, it } from "vitest";

import {
  downloadCompileOutputs,
  KEPT_COMPILE_OUTPUTS,
} from "../../../src/overleaf/web/compileOutputDownloads.js";
import { compileOnOverleaf } from "../../../src/overleaf/web/overleafCompile.js";
import { FAKE_PDF_BYTES } from "../../integration/fakeOverleafAccount.js";
import { useFakeOverleafConnection } from "./support/fakeOverleafConnection.js";

describe("downloading the outputs worth keeping from a compile on Overleaf", () => {
  const connection = useFakeOverleafConnection();
  const compileAndDownload = async (paths?: readonly string[]) => {
    const client = connection.client();
    const result = await compileOnOverleaf(client, connection.overleaf.projectId, {
      draft: false,
      stopOnFirstError: false,
    });
    return await downloadCompileOutputs(client, result, paths);
  };

  it("downloads the PDF, log, bibliography, its log and the SyncTeX map when the compile made them", async () => {
    const account = connection.overleaf.web.account;
    account.bibliography = "\\begin{thebibliography}{1}\n\\end{thebibliography}\n";
    account.bibliographyLog = "This is BibTeX, Version 0.99d\n";
    account.synctexBytes = Buffer.from([0x1f, 0x8b, 0x08, 0x00]);
    const downloads = await compileAndDownload();
    expect(downloads.map((download) => download.file.path).sort()).toEqual([...KEPT_COMPILE_OUTPUTS].sort());
    const bytesOf = (path: string) => downloads.find((download) => download.file.path === path)?.bytes;
    expect(bytesOf("output.pdf")).toEqual(FAKE_PDF_BYTES);
    expect(bytesOf("output.bbl")?.toString("utf8")).toBe(account.bibliography);
    expect(bytesOf("output.synctex.gz")).toEqual(account.synctexBytes);
  });

  it("skips the files a compile did not produce", async () => {
    const downloads = await compileAndDownload();
    expect(downloads.map((download) => download.file.path)).toEqual(["output.pdf", "output.log"]);
  });

  it("downloads only the files asked for", async () => {
    const downloads = await compileAndDownload(["output.log"]);
    expect(downloads.map((download) => download.file.path)).toEqual(["output.log"]);
    expect(downloads[0]?.bytes.toString("utf8")).toBe(connection.overleaf.web.account.compileLog);
  });
});
