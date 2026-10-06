import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTokenBlocks, themeContrastFailures } from "../lib/contrast";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const { light, dark, darkSystem } = parseTokenBlocks(css);

describe("theme contrast", () => {
  it("keeps the system dark tokens identical to the dark toggle", () => {
    expect(darkSystem).toEqual(dark);
  });

  it("meets text and marker contrast in light", () => {
    expect(themeContrastFailures(light)).toEqual([]);
  });

  it("meets text and marker contrast in dark", () => {
    expect(themeContrastFailures(dark)).toEqual([]);
  });
});
