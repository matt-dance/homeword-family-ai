export type AgeTheme = "young" | "curious" | "teen";

export interface AgeThemeConfig {
  title: string;
  ageRange: string;
  avatarEmoji: string;
  avatarBg: string;
  ambientGradient: string;
  bubbleRadius: string;
  fontSize: string;
  fontSizeSimple: string;
  heroSub: string;
  cardBlob: string;
  cardAvatar: string;
}

export function getAgeTheme(child?: { age?: number; preset_id?: string }): AgeTheme {
  if (!child) return "curious";
  const preset = child.preset_id?.toLowerCase() || "";
  const age = child.age ?? 0;

  // Explicit preset wins — kid chat loads profiles from the public API, which
  // must include preset_id/age or every child defaults to curious.
  if (preset.includes("young")) return "young";
  if (preset.includes("teen")) return "teen";
  if (preset.includes("curious")) return "curious";

  if (age > 0 && age <= 8) return "young";
  if (age >= 13) return "teen";
  return "curious";
}

export const AGE_THEME_CONFIGS: Record<AgeTheme, AgeThemeConfig> = {
  young: {
    title: "Young Explorer",
    ageRange: "Ages 5–8",
    avatarEmoji: "🦁",
    avatarBg: "bg-gradient-to-tr from-amber-400 to-orange-400 text-white shadow-sm shadow-amber-500/20",
    ambientGradient:
      "bg-gradient-to-b from-amber-100/40 via-orange-50/20 to-background dark:from-amber-950/20 dark:via-slate-900/40 dark:to-background",
    bubbleRadius: "rounded-3xl",
    fontSize: "text-base",
    fontSizeSimple: "text-lg sm:text-xl",
    heroSub: "Pick a fun idea below, or tap the big mic button to speak!",
    cardBlob: "bg-orange-50 dark:bg-orange-950/30",
    cardAvatar: "bg-orange-100 dark:bg-orange-900/40",
  },
  curious: {
    title: "Curious Explorer",
    ageRange: "Ages 9–12",
    avatarEmoji: "🧭",
    avatarBg: "bg-gradient-to-tr from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-500/20",
    ambientGradient:
      "bg-gradient-to-b from-emerald-100/30 via-teal-50/15 to-background dark:from-emerald-950/20 dark:via-slate-900/40 dark:to-background",
    bubbleRadius: "rounded-2xl",
    fontSize: "text-sm sm:text-base",
    fontSizeSimple: "text-base sm:text-lg",
    heroSub: "Ask for homework help, a quiz, definitions, or fun facts!",
    cardBlob: "bg-blue-50 dark:bg-blue-950/30",
    cardAvatar: "bg-blue-100 dark:bg-blue-900/40",
  },
  teen: {
    title: "Teen Guided",
    ageRange: "Ages 13–17",
    avatarEmoji: "⚡",
    avatarBg: "bg-gradient-to-tr from-indigo-500 to-violet-500 text-white shadow-sm shadow-indigo-500/20",
    ambientGradient:
      "bg-gradient-to-b from-indigo-100/30 via-slate-50/10 to-background dark:from-indigo-950/25 dark:via-slate-900/40 dark:to-background",
    bubbleRadius: "rounded-2xl",
    fontSize: "text-sm",
    fontSizeSimple: "text-base",
    heroSub: "Type a question, practice concepts, or set timers for study sessions.",
    cardBlob: "bg-violet-50 dark:bg-violet-950/30",
    cardAvatar: "bg-violet-100 dark:bg-violet-900/40",
  },
};

export function getAgeThemeConfig(child?: { age?: number; preset_id?: string }): AgeThemeConfig {
  return AGE_THEME_CONFIGS[getAgeTheme(child)] ?? AGE_THEME_CONFIGS.curious;
}
