"use client";

export type VoiceGender = "female" | "male";

interface VoiceGenderPickerProps {
  value: VoiceGender;
  onChange: (value: VoiceGender) => void;
}

export function VoiceGenderPicker({ value, onChange }: VoiceGenderPickerProps) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Read-aloud voice
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["female", "Female"],
            ["male", "Male"],
          ] as const
        ).map(([gender, label]) => {
          const selected = value === gender;
          return (
            <button
              key={gender}
              type="button"
              onClick={() => onChange(gender)}
              className={`h-10 rounded-xl border text-sm font-semibold transition-colors ${
                selected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border/80 text-muted-foreground hover:bg-muted/40"
              }`}
              aria-pressed={selected}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
