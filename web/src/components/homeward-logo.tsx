import { Home } from "lucide-react";
import Link from "next/link";

export function HomewardLogo({ className }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 font-semibold text-lg ${className || ""}`}>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Home className="h-5 w-5" />
      </div>
      <span>Homeward</span>
    </Link>
  );
}
