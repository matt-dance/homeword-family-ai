/** Pick a reliable English voice for read-aloud (local voices first — cloud voices often fail silently). */

const PREFERRED_LOCAL_PATTERNS = [
  /Microsoft (Aria|Jenny|Guy|Zira)/i,
  /Samantha/i,
  /Karen/i,
  /Daniel/i,
  /Google US English/i,
  /English \(United States\)/i,
  /English \(US\)/i,
];

const PREFERRED_CLOUD_PATTERNS = [
  /Google.*English.*(Natural|Neural|Online)/i,
  /Microsoft.*Natural/i,
];

function englishVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
}

export function pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;

  const en = englishVoices(voices);
  const pool = en.length ? en : voices;
  const local = pool.filter((v) => v.localService);
  const searchPools = [local, pool];

  for (const patterns of [PREFERRED_LOCAL_PATTERNS, PREFERRED_CLOUD_PATTERNS]) {
    for (const group of searchPools) {
      for (const pattern of patterns) {
        const match = group.find((v) => pattern.test(v.name));
        if (match) return match;
      }
    }
  }

  return local[0] ?? pool[0] ?? null;
}

export function loadBestVoice(onVoice: (voice: SpeechSynthesisVoice | null) => void): () => void {
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
  utterance.rate = 0.95;
  utterance.pitch = 1;
  utterance.volume = 1;
}

export function tokenizeWords(text: string): string[] {
  return text.match(/\S+/g) ?? [];
}

/** Strip emoji and odd characters that cause browser TTS to silently fail. */
export function sanitizeForSpeech(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u2600-\u27BF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
