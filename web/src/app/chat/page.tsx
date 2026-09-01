"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, type Child } from "@/lib/api";
import { chatPathForChild } from "@/lib/slug";
import { getAgeTheme, AGE_THEME_CONFIGS } from "@/lib/age-theme";
import { HomewardLogo } from "@/components/homeward-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sparkles, Home, ArrowRight, Lock, BookOpen, Globe } from "lucide-react";

function ChatPickerContent() {
  const router = useRouter();
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .childrenPublic()
      .then((kids) => {
        setChildren(kids);
        if (kids.length === 1) {
          router.replace(chatPathForChild(kids[0]));
        }
      })
      .catch(() => router.replace("/setup"))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Sparkles className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 p-6 bg-background text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="h-8 w-8" />
        </div>
        <div>
          <h2 className="text-xl font-bold">No profiles yet</h2>
          <p className="text-muted-foreground mt-1 max-w-sm">
            Ask a parent to set up Homeward to add your profile.
          </p>
        </div>
        <Link href="/">
          <Button variant="outline" className="rounded-xl">
            <Home className="mr-2 h-4 w-4" />
            Home
          </Button>
        </Link>
      </div>
    );
  }

  if (children.length === 1) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Sparkles className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background flex flex-col">
      <header className="border-b border-border/70 bg-card/85 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <HomewardLogo showTagline />
        <ThemeToggle />
      </header>

      <main className="mx-auto flex-1 max-w-lg w-full p-6 sm:p-10 flex flex-col justify-center animate-fade-in">
        <div className="text-center mb-8 space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-indigo-500 text-2xl text-white shadow-md shadow-primary/25 animate-bounce-gentle">
            👋
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Who&apos;s chatting today?
          </h1>
          <p className="text-muted-foreground text-sm">
            Pick your profile to jump right into your chat
          </p>
        </div>

        <div className="space-y-3.5">
          {children.map((child) => {
            const themeKey = getAgeTheme(child);
            const theme = AGE_THEME_CONFIGS[themeKey];

            return (
              <Link key={child.id} href={chatPathForChild(child)}>
                <div className="group relative flex items-center justify-between rounded-2xl border border-border/80 bg-card/90 p-4 sm:p-5 shadow-xs transition-all hover:border-primary/60 hover:shadow-md active:scale-[0.99]">
                  <div className="flex items-center gap-4 min-w-0">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl shadow-xs transition-transform group-hover:scale-105 ${theme.avatarBg}`}
                    >
                      {theme.avatarEmoji}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-foreground group-hover:text-primary transition-colors truncate">
                          {child.name}
                        </span>
                        {child.has_pin && (
                          <span title="PIN Protected">
                            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span>{theme.title}</span>
                        {child.homework_mode && (
                          <span className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            · <BookOpen className="h-3 w-3" /> Homework
                          </span>
                        )}
                        {child.live_lookups && (
                          <span className="font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1">
                            · <Globe className="h-3 w-3" /> Lookups
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-all shrink-0">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Sparkles className="h-8 w-8 animate-pulse text-primary" />
        </div>
      }
    >
      <ChatPickerContent />
    </Suspense>
  );
}
