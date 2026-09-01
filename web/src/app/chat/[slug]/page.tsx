"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, type Child } from "@/lib/api";
import { slugifyName } from "@/lib/slug";
import { KidChatView } from "@/components/kid-chat-view";
import { HomewardLogo } from "@/components/homeward-logo";
import { Button } from "@/components/ui/button";
import { Sparkles, Home, ArrowLeft } from "lucide-react";

function findChildBySlug(children: Child[], slug: string): Child | undefined {
  const normalized = slug.toLowerCase();
  return children.find(
    (child) =>
      (child.slug ?? slugifyName(child.name)).toLowerCase() === normalized ||
      slugifyName(child.name) === normalized,
  );
}

function ChildChatContent() {
  const router = useRouter();
  const params = useParams();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;

    api
      .childrenPublic()
      .then((kids) => {
        setChildren(kids);
        const match = findChildBySlug(kids, slug);
        if (match) {
          setSelectedChild(match);
          setNotFound(false);
        } else if (kids.length === 0) {
          router.replace("/setup");
        } else {
          setNotFound(true);
        }
      })
      .catch(() => router.replace("/setup"))
      .finally(() => setLoading(false));
  }, [slug, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Sparkles className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50/50 to-background dark:from-slate-900/50">
        <header className="border-b border-border bg-card/80 p-4">
          <HomewardLogo />
        </header>
        <main className="mx-auto max-w-md p-8 text-center">
          <Sparkles className="mx-auto h-12 w-12 text-primary mb-4" />
          <h1 className="text-2xl font-bold mb-2">Profile not found</h1>
          <p className="text-muted-foreground mb-6">
            We couldn&apos;t find a chat profile for &ldquo;{slug}&rdquo;.
          </p>
          <div className="flex flex-col gap-3">
            <Link href="/chat">
              <Button className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Pick a profile
              </Button>
            </Link>
            <Link href="/">
              <Button variant="outline" className="w-full">
                <Home className="mr-2 h-4 w-4" />
                Home
              </Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!selectedChild) {
    return null;
  }

  return (
    <KidChatView
      selectedChild={selectedChild}
      onSwitchProfile={() => {
        if (children.length <= 1) {
          router.push("/");
        } else {
          router.push("/chat");
        }
      }}
    />
  );
}

export default function ChildChatPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading…</div>}>
      <ChildChatContent />
    </Suspense>
  );
}
