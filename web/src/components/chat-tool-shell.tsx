"use client";

import type { ReactNode } from "react";

export function CardShell({
  icon,
  title,
  badge,
  children,
  className = "",
}: {
  icon: ReactNode;
  title: string;
  badge?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-primary/25 bg-gradient-to-br from-card to-primary/5 p-4 sm:p-5 shadow-sm space-y-3.5 transition-all ${className}`}
    >
      <div className="flex items-center justify-between border-b border-border/50 pb-2.5">
        <div className="flex items-center gap-2.5 font-semibold text-foreground text-sm sm:text-base">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <span>{title}</span>
        </div>
        {badge && (
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary border border-primary/20">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
