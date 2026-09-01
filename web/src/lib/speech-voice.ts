/** Pick the most natural-sounding English voice available in the browser. */

const PREFERRED_VOICE_PATTERNS = [
  /Google.*English.*(Natural|Neural|Online)/i,
  /Microsoft (Aria|Jenny|Guy|Ana|Zira|Natural)/i,
  /Samantha/i,
  /Karen/i,
  /Daniel/i,
  /Google US English/i,
  /English \(United States\).*Premium/i,
  /English \(US\)/i,
];

function englishVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
}

export function pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;

  const en = englishVoices(voices);
  const pool = en.length ? en : voices;

  for (const pattern of PREFERRED_VOICE_PATTERNS) {
    const match = pool.find((v) => pattern.test(v.name));
    if (match) return match;
  }

  // Cloud / neural voices are usually higher quality than bundled eSpeak-style voices.
  const cloud = pool.find((v) => !v.localService);
  if (cloud) return cloud;

  return pool[0] ?? null;
}

export function loadBestVoice(
  onVoice: (voice: SpeechSynthesisVoice | null) => void,
): () => void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onVoice(null);
    return () => undefined;
  }

  const refresh = () => onVoice(pickBestVoice(window.speechSynthesis.getVoices()));
  refresh();
  window.speechSynthesis.addEventListener("voiceschanged", refresh);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", refresh);
}

export function applyVoiceSettings(utterance: SpeechSynthesisUtterance, voice: SpeechSynthesisVoice | null) {
  if (voice) utterance.voice = voice;
  utterance.rate = 0.93;
  utterance.pitch = 1;
  utterance.volume = 1;
}
