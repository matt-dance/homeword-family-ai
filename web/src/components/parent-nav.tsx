"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomewardLogo } from "@/components/homeward-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
} from "lucide-react";

interface ParentNavProps {
  onLogout: () => void;
}

export function ParentNav({ onLogout }: ParentNavProps) {
  const pathname = usePathname();
  const onDashboard = pathname === "/dashboard";
  const onProfiles = pathname.startsWith("/dashboard/profiles");
  const onSettings = pathname.startsWith("/dashboard/settings");

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-card/85 backdrop-blur-md shadow-xs transition-colors">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <HomewardLogo showTagline />

        <nav className="flex items-center gap-1 rounded-xl bg-muted/70 p-1 border border-border/50">
          <Link href="/dashboard">
            <Button
              variant={onDashboard ? "default" : "ghost"}
              size="sm"
              className={`rounded-lg transition-all ${
                onDashboard
                  ? "shadow-sm shadow-primary/20 font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
              }`}
            >
              <LayoutDashboard className="mr-1.5 h-4 w-4" />
              <span>Dashboard</span>
            </Button>
          </Link>
          <Link href="/dashboard/profiles">
            <Button
              variant={onProfiles ? "default" : "ghost"}
              size="sm"
              className={`rounded-lg transition-all ${
                onProfiles
                  ? "shadow-sm shadow-primary/20 font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
              }`}
            >
              <Users className="mr-1.5 h-4 w-4" />
              <span>Profiles</span>
            </Button>
          </Link>
          <Link href="/dashboard/settings">
            <Button
              variant={onSettings ? "default" : "ghost"}
              size="sm"
              className={`rounded-lg transition-all ${
                onSettings
                  ? "shadow-sm shadow-primary/20 font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
              }`}
            >
              <Settings className="mr-1.5 h-4 w-4" />
              <span>Settings</span>
            </Button>
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/chat">
            <Button
              variant="outline"
              size="sm"
              className="border-primary/30 text-primary hover:bg-primary/5 font-medium shadow-xs"
            >
              <ExternalLink className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Kid Chat</span>
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={onLogout}
            title="Sign out of Parent Dashboard"
            aria-label="Sign out"
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
