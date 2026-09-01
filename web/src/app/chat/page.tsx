"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, type Child } from "@/lib/api";
import { chatPathForChild } from "@/lib/slug";
import { HomewardLogo } from "@/components/homeward-logo";
import { Button } from "@/components/ui/button";
import { Sparkles, Home } from "lucide-react";

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
      <div className="flex min-h-screen items-center justify-center">
        <Sparkles className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <p className="text-muted-foreground">No profiles yet. Ask a parent to set up Homeward.</p>
        <Link href="/">
          <Button variant="outline">
            <Home className="mr-2 h-4 w-4" />
            Home
          </Button>
        </Link>
      </div>
    );
  }

  if (children.length === 1) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Sparkles className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/50 to-background dark:from-slate-900/50">
      <header className="border-b border-border bg-card/80 p-4">
        <HomewardLogo />
      </header>
      <main className="mx-auto max-w-md p-8">
        <div className="text-center mb-8">
          <Sparkles className="mx-auto h-12 w-12 text-primary mb-4" />
          <h1 className="text-2xl font-bold">Who&apos;s chatting today?</h1>
          <p className="text-muted-foreground mt-2">Pick your profile to start</p>
        </div>
        <div className="space-y-3">
          {children.map((child) => (
            <Link key={child.id} href={chatPathForChild(child)}>
              <Button variant="outline" className="w-full h-14 text-lg justify-start px-6">
                {child.name}
              </Button>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading…</div>}>
      <ChatPickerContent />
    </Suspense>
  );
}
