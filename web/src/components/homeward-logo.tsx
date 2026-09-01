import { Shield, Sparkles } from "lucide-react";
import Link from "next/link";

interface HomewardLogoProps {
  className?: string;
  size?: "default" | "sm" | "lg";
  showTagline?: boolean;
}

export function HomewardLogo({
  className = "",
  size = "default",
  showTagline = false,
}: HomewardLogoProps) {
  const iconSizes = {
    sm: "h-7 w-7",
    default: "h-9 w-9",
    lg: "h-11 w-11",
  };

  const textSizes = {
    sm: "text-base",
    default: "text-lg",
    lg: "text-2xl",
  };

  return (
    <Link
      href="/"
      className={`group inline-flex items-center gap-2.5 font-bold transition-opacity hover:opacity-95 ${className}`}
    >
      <div
        className={`relative flex items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-indigo-500 text-primary-foreground shadow-sm shadow-primary/25 transition-transform group-hover:scale-105 ${iconSizes[size]}`}
      >
        <Shield className="h-5 w-5 fill-primary-foreground/20 stroke-[2.2]" />
        <Sparkles className="absolute -top-1 -right-1 h-3.5 w-3.5 text-amber-300 animate-pulse" />
      </div>
      <div className="flex flex-col">
        <span
          className={`tracking-tight bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text ${textSizes[size]}`}
        >
          Homeward
        </span>
        {showTagline && (
          <span className="text-[11px] font-medium text-muted-foreground -mt-0.5">
            Family AI Safety
          </span>
        )}
      </div>
    </Link>
  );
}
