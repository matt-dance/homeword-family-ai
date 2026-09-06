/** Kid-facing copy for opt-in conversation mode. */

export function conversationModeAvailable(opts: {
  voiceSupported: boolean;
  readAloudSupported: boolean;
}): boolean {
  return opts.voiceSupported && opts.readAloudSupported;
}

export function conversationToggleLabel(active: boolean): string {
  return active ? "Stop conversation" : "Talk together";
}

export function conversationToggleTitle(active: boolean): string {
  return active
    ? "Stop talking out loud. You can still tap the mic or type."
    : "Talk out loud: I listen, read the reply, then listen again. Tap or talk to interrupt.";
}

export function conversationMicLabel(opts: {
  conversationActive: boolean;
  speaking: boolean;
  listening: boolean;
}): string {
  if (opts.conversationActive && opts.speaking) return "Interrupt and talk";
  if (opts.listening) return "Stop voice listening";
  return "Speak with microphone";
}

export const BARGE_IN_TAP_HINT =
  "Tap the mic to interrupt — I couldn't hear over the speaker.";
