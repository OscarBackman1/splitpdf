import { describe, expect, it } from "vitest";
import { parsePageRange } from "./pageRange";

describe("parsePageRange", () => {
  it("returns all zero-based page indexes", () => {
    expect(parsePageRange("all", 4)).toEqual([0, 1, 2, 3]);
  });

  it("supports mixed page selections", () => {
    expect(parsePageRange("1,3,5-7", 8)).toEqual([0, 2, 4, 5, 6]);
  });

  it("supports open ranges", () => {
    expect(parsePageRange("2-,-3", 5)).toEqual([0, 1, 2, 3, 4]);
  });

  it("rejects backwards ranges", () => {
    expect(() => parsePageRange("5-2", 8)).toThrow(/backwards/);
  });
});
