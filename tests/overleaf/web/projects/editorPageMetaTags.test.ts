import { describe, expect, it } from "vitest";

import {
  readBooleanMetaTag,
  readJsonMetaTag,
  readMetaTag,
} from "../../../../src/overleaf/web/projects/editorPageMetaTags.js";
import { readProjectSettingChoices } from "../../../../src/overleaf/web/projects/projectSettingChoices.js";

describe("reading the editor page's meta tags", () => {
  it("reads a true boolean as a bare content attribute and a false one as none, as Pug writes them", () => {
    const page =
      '<meta name="ol-on" data-type="boolean" content><meta name="ol-off" data-type="boolean"><meta name="ol-x" content="1">';
    expect(readBooleanMetaTag(page, "ol-on")).toBe(true);
    expect(readBooleanMetaTag(page, "ol-off")).toBe(false);
    expect(readBooleanMetaTag(page, "ol-missing")).toBeUndefined();
  });

  it("decodes the HTML entities in escaped JSON", () => {
    const page = `<meta name="ol-languages" data-type="json" content="[{&quot;code&quot;:&quot;fr&quot;,&quot;name&quot;:&quot;Fran&#231;ais &amp; co&quot;}]">`;
    expect(readJsonMetaTag(page, "ol-languages")).toEqual([{ code: "fr", name: "Français & co" }]);
    expect(readMetaTag(page, "ol-languag")).toBeUndefined();
  });

  it("leaves a character reference past U+10FFFF as written", () => {
    const page = '<meta name="ol-x" content="&#x110000; &#99999999; &#65;">';
    expect(readMetaTag(page, "ol-x")).toEqual({ content: "&#x110000; &#99999999; A" });
  });

  it("reads a page of meta tags that never close at once", () => {
    const openTags = `${"<meta\t".repeat(1000)}${'name="ol-x"'.repeat(1000)}`;
    const oneOpenTag = `<meta\t${'name="ol-x"'.repeat(20_000)}`;
    const started = performance.now();
    expect(readMetaTag(openTags, "ol-x")).toBeUndefined();
    expect(readMetaTag(oneOpenTag, "ol-x")).toBeUndefined();
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("keeps an image the account may not switch to as not allowed, and skips malformed entries", () => {
    const images = JSON.stringify([
      { imageName: "texlive-full:2025.1", imageDesc: "TeX Live 2025" },
      { imageName: "texlive-full:2016.1", imageDesc: "TeX Live 2016", allowed: false },
      { imageDesc: "no name" },
    ]).replace(/"/g, "&quot;");
    const choices = readProjectSettingChoices(
      `<meta name="ol-imageNames" data-type="json" content="${images}">`,
    );
    expect(choices).toEqual({
      texLiveImages: [
        { imageName: "texlive-full:2025.1", description: "TeX Live 2025", allowed: true },
        { imageName: "texlive-full:2016.1", description: "TeX Live 2016", allowed: false },
      ],
      spellCheckLanguages: [],
      hasTrackChangesFeature: undefined,
    });
  });
});
