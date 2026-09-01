export type AgeTheme = "young" | "curious" | "teen";

export interface AgeThemeConfig {
  id: AgeTheme;
  title: string;
  ageRange: string;
  avatarEmoji: string;
  avatarBg: string;
  ambientGradient: string;
  bubbleRadius: string;
  fontSize: string;
  fontSizeSimple: string;
  accentBorder: string;
  heroGreeting: string;
  heroSub: string;
}

export function getAgeTheme(child?: { age?: number; preset_id?: string }): AgeTheme {
  if (!child) return "curious";
  const preset = child.preset_id?.toLowerCase() || "";
  const age = child.age ?? 0;

  if (preset.includes("young") || (age > 0 && age <= 8)) {
    return "young";
  }
  if (preset.includes("teen") || age >= 13) {
    return "teen";
  }
  return "curious";
}

export const AGE_THEME_CONFIGS: Record<AgeTheme, AgeThemeConfig> = {
  young: {
    id: "young",
    title: "Young Explorer",
    ageRange: "Ages 5–8",
    avatarEmoji: "🦁",
    avatarBg: "bg-gradient-to-tr from-amber-400 to-orange-400 text-white shadow-sm shadow-amber-500/20",
    ambientGradient:
      "bg-gradient-to-b from-amber-100/40 via-orange-50/20 to-background dark:from-amber-950/20 dark:via-slate-900/40 dark:to-background",
    bubbleRadius: "rounded-3xl",
    fontSize: "text-base",
    fontSizeSimple: "text-lg sm:text-xl",
    accentBorder: "border-amber-200/60 dark:border-amber-900/40",
    heroGreeting: "Let's explore together! 🌟",
    heroSub: "Pick a fun idea below, or tap the big mic button to speak!",
  },
  curious: {
    id: "curious",
    title: "Curious Explorer",
    ageRange: "Ages 9–12",
    avatarEmoji: "🧭",
    avatarBg: "bg-gradient-to-tr from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-500/20",
    ambientGradient:
      "bg-gradient-to-b from-emerald-100/30 via-teal-50/15 to-background dark:from-emerald-950/20 dark:via-slate-900/40 dark:to-background",
    bubbleRadius: "rounded-2xl",
    fontSize: "text-sm sm:text-base",
    fontSizeSimple: "text-base sm:text-lg",
    accentBorder: "border-teal-200/60 dark:border-teal-900/40",
    heroGreeting: "Ready for your next question? 🚀",
    heroSub: "Ask for homework help, a quiz, definitions, or fun facts!",
  },
  teen: {
    id: "teen",
    title: "Teen Guided",
    ageRange: "Ages 13–17",
    avatarEmoji: "⚡",
    avatarBg: "bg-gradient-to-tr from-indigo-500 to-violet-500 text-white shadow-sm shadow-indigo-500/20",
    ambientGradient:
      "bg-gradient-to-b from-indigo-100/30 via-slate-50/10 to-background dark:from-indigo-950/25 dark:via-slate-900/40 dark:to-background",
    bubbleRadius: "rounded-2xl",
    fontSize: "text-sm",
    fontSizeSimple: "text-base",
    accentBorder: "border-indigo-200/60 dark:border-indigo-900/40",
    heroGreeting: "What are we working on today?",
    heroSub: "Type a question, practice concepts, or set timers for study sessions.",
  },
};
