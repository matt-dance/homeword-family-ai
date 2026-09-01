"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomewardLogo } from "@/components/homeward-logo";
import { Button } from "@/components/ui/button";
import { ExternalLink, LayoutDashboard, LogOut, Settings } from "lucide-react";

interface ParentNavProps {
  onLogout: () => void;
}

export function ParentNav({ onLogout }: ParentNavProps) {
  const pathname = usePathname();
  const onDashboard = pathname === "/dashboard";
  const onSettings = pathname.startsWith("/dashboard/settings");

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 p-4">
        <HomewardLogo />
        <nav className="flex items-center gap-1">
          <Link href="/dashboard">
            <Button variant={onDashboard ? "default" : "ghost"} size="sm">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
          </Link>
          <Link href="/dashboard/settings">
            <Button variant={onSettings ? "default" : "ghost"} size="sm">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/chat">
            <Button variant="outline" size="sm">
              <ExternalLink className="mr-2 h-4 w-4" />
              Kid Chat
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={onLogout} aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
