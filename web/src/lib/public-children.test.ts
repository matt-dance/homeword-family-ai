import { describe, expect, it } from "vitest";
import { asChildList } from "./public-children";

describe("asChildList", () => {
  it("returns an empty list for non-arrays", () => {
    expect(asChildList(undefined)).toEqual([]);
    expect(asChildList(null)).toEqual([]);
    expect(asChildList({ id: 1, name: "Avery" })).toEqual([]);
  });

  it("drops null or unusable entries so the picker can render", () => {
    expect(
      asChildList([
        { id: 1, name: "Avery" },
        null,
        { name: "Missing id" },
        { id: 2, name: "Jordan" },
      ]),
    ).toEqual([
      { id: 1, name: "Avery" },
      { id: 2, name: "Jordan" },
    ]);
  });
});
