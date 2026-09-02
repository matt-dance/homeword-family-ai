import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  clearDeviceProfileId,
  findChildById,
  getDeviceProfileId,
  setDeviceProfileId,
} from "./device-profile";

describe("device-profile", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    });
    clearDeviceProfileId();
  });

  it("stores and retrieves profile id", () => {
    expect(getDeviceProfileId()).toBeNull();
    setDeviceProfileId(42);
    expect(getDeviceProfileId()).toBe(42);
    clearDeviceProfileId();
    expect(getDeviceProfileId()).toBeNull();
  });

  it("finds child by saved id", () => {
    const kids = [{ id: 1, name: "A" }, { id: 2, name: "B" }];
    expect(findChildById(kids, 2)?.name).toBe("B");
    expect(findChildById(kids, 99)).toBeUndefined();
  });
});
