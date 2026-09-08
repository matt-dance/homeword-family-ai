/** Parent Open web search control: live-lookups gate plus engine availability. */

export type EngineAvailability = boolean | null;

export function openWebSearchControlState({
  liveLookupsOn,
  openWebSearch,
  engineAvailable,
}: {
  liveLookupsOn: boolean;
  openWebSearch: boolean;
  engineAvailable: EngineAvailability;
}): {
  checked: boolean;
  disabled: boolean;
  showUnavailable: boolean;
} {
  // Unknown (still loading) must not look enabled — a stored true plus a slow
  // health check is how the toggle can appear on while the engine is down.
  const engineReady = engineAvailable === true;
  return {
    checked: liveLookupsOn && openWebSearch && engineReady,
    disabled: !liveLookupsOn || !engineReady,
    showUnavailable: engineAvailable === false,
  };
}
