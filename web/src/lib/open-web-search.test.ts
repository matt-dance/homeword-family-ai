import { describe, expect, it } from "vitest";
import { openWebSearchControlState } from "./open-web-search";

describe("openWebSearchControlState", () => {
  it("keeps Open web off and disabled when live lookups is off", () => {
    expect(
      openWebSearchControlState({
        liveLookupsOn: false,
        openWebSearch: true,
        engineAvailable: true,
      }),
    ).toEqual({ checked: false, disabled: true, showUnavailable: false });
  });

  it("unchecks and disables when the engine is unavailable even if stored on", () => {
    expect(
      openWebSearchControlState({
        liveLookupsOn: true,
        openWebSearch: true,
        engineAvailable: false,
      }),
    ).toEqual({ checked: false, disabled: true, showUnavailable: true });
  });

  it("does not appear enabled while engine status is still loading", () => {
    expect(
      openWebSearchControlState({
        liveLookupsOn: true,
        openWebSearch: true,
        engineAvailable: null,
      }),
    ).toEqual({ checked: false, disabled: true, showUnavailable: false });
  });

  it("is usable when live lookups and the engine are both on", () => {
    expect(
      openWebSearchControlState({
        liveLookupsOn: true,
        openWebSearch: true,
        engineAvailable: true,
      }),
    ).toEqual({ checked: true, disabled: false, showUnavailable: false });

    expect(
      openWebSearchControlState({
        liveLookupsOn: true,
        openWebSearch: false,
        engineAvailable: true,
      }),
    ).toEqual({ checked: false, disabled: false, showUnavailable: false });
  });

  it("still shows unavailable copy when live lookups is off and the engine is down", () => {
    expect(
      openWebSearchControlState({
        liveLookupsOn: false,
        openWebSearch: false,
        engineAvailable: false,
      }),
    ).toEqual({ checked: false, disabled: true, showUnavailable: true });
  });
});
