import { Home } from "lucide-react";
import Link from "next/link";

interface HomewardLogoProps {
  className?: string;
  size?: "default" | "sm";
  showTagline?: boolean;
}

export function HomewardLogo({
  className = "",
  size = "default",
  showTagline = false,
}: HomewardLogoProps) {
  const iconSizes = {
    sm: "h-8 w-8",
    default: "h-10 w-10",
  };

  const textSizes = {
    sm: "text-lg",
    default: "text-2xl",
  };

  return (
    <Link
      href="/"
      className={`group inline-flex items-center gap-3 font-bold transition-opacity hover:opacity-95 ${className}`}
    >
      <div
        className={`relative flex items-center justify-center rounded-xl accent-gradient text-white shadow-lg shadow-orange-200 dark:shadow-orange-950/40 transition-transform group-hover:scale-105 ${iconSizes[size]}`}
      >
        <Home className="h-5 w-5" strokeWidth={2.2} />
      </div>
      <div className="flex flex-col">
        <span
          className={`font-display tracking-tight text-slate-800 dark:text-foreground ${textSizes[size]}`}
        >
          Homeward
        </span>
        {showTagline && (
          <span className="text-[11px] font-medium text-muted-foreground -mt-0.5">
            Local family AI
          </span>
        )}
      </div>
    </Link>
  );
}
