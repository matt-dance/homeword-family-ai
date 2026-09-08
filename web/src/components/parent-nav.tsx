"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { HomewardLogo } from "@/components/homeward-logo";
import { KidChatLink } from "@/components/kid-chat-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Cpu,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
} from "lucide-react";

interface ParentNavProps {
  onLogout: () => void;
}

export function ParentNav({ onLogout }: ParentNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [modelName, setModelName] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .ollamaStatus()
      .then((status) => {
        if (cancelled) return;
        setModelName(status.chat_model || null);
        setModelReady(status.ready);
      })
      .catch(() => {
        if (!cancelled) setModelReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const onDashboard = pathname === "/dashboard";
  const onProfiles = pathname.startsWith("/dashboard/profiles");
  const onSettings = pathname.startsWith("/dashboard/settings");

  const navClass = (active: boolean) =>
    `flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 font-medium ${
      active
        ? "sidebar-item-active"
        : "text-slate-500 hover:bg-slate-50 dark:hover:bg-muted"
    }`;

  const sidebar = (
    <>
      <div className="p-6">
        <div className="mb-10 flex items-center justify-between gap-3">
          <HomewardLogo />
          <button
            type="button"
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-50 lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="space-y-1">
          <Link href="/dashboard" className={navClass(onDashboard)}>
            <LayoutDashboard className="h-5 w-5" />
            <span>Dashboard</span>
          </Link>
          <Link href="/dashboard/profiles" className={navClass(onProfiles)}>
            <Users className="h-5 w-5" />
            <span>Children</span>
          </Link>
          <Link href="/dashboard/settings" className={navClass(onSettings)}>
            <Settings className="h-5 w-5" />
            <span>Settings</span>
          </Link>
        </nav>
      </div>

      <div className="mt-auto space-y-4 p-6">
        <div className="rounded-2xl bg-blue-50 p-4 dark:bg-blue-950/40">
          <div className="mb-1 flex items-center gap-2 text-blue-700 dark:text-blue-300">
            <Cpu className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Local Model</span>
          </div>
          <p className="text-sm font-semibold text-slate-800 dark:text-foreground">
            {modelName || "Ollama"}
          </p>
          <div className="mt-3 h-1.5 w-full rounded-full bg-blue-100 dark:bg-blue-900/60">
            <div
              className={`h-1.5 rounded-full ${modelReady ? "bg-blue-500 w-full" : "bg-amber-400 w-2/5"}`}
            />
          </div>
          <p className="mt-2 text-[10px] text-blue-600 dark:text-blue-300">
            {modelReady
              ? "Running locally via Ollama"
              : "Still setting up — chat waits until it is ready"}
          </p>
        </div>

        <KidChatLink className={navClass(false)}>
          <ExternalLink className="h-5 w-5" />
          <span>Quick Chat</span>
        </KidChatLink>

        <div className="flex items-center justify-between gap-2 px-1">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={onLogout}
            title="Sign out of Parent Dashboard"
            aria-label="Sign out"
            className="text-slate-400 hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-100 bg-white/90 px-4 py-3 backdrop-blur-md dark:border-border dark:bg-card/90 lg:hidden">
        <HomewardLogo size="sm" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-2xl border border-slate-200 p-2.5 text-slate-400 hover:text-slate-600 dark:border-border"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {open && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm lg:hidden"
          aria-label="Close navigation overlay"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-64 flex-col border-r border-slate-100 bg-white dark:border-border dark:bg-card ${
          open ? "translate-x-0" : "-translate-x-full"
        } transition-transform duration-200 lg:translate-x-0`}
      >
        {sidebar}
      </aside>
    </>
  );
}
