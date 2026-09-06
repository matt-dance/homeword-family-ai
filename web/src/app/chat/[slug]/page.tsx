"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, type Child } from "@/lib/api";
import { slugifyName } from "@/lib/slug";
import { QUICK_CHAT_LABEL, QUICK_CHAT_SLUG } from "@/lib/default-profile";
import { KidChatView } from "@/components/kid-chat-view";
import { setDeviceProfileId } from "@/lib/device-profile";
import { HomewardLogo } from "@/components/homeward-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowLeft } from "lucide-react";

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
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [displayName, setDisplayName] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!slug) return;

    api
      .childrenPublic()
      .then((kids) => {
        if (slug.toLowerCase() === QUICK_CHAT_SLUG) {
          // Anonymous Quick Chat: reuse the default profile's safety settings.
          // KidChatView skips that child's PIN when quickChat is set.
          const defaultChild = kids.find((child) => child.is_default);
          if (defaultChild) {
            setSelectedChild(defaultChild);
            setDisplayName(QUICK_CHAT_LABEL);
            setNotFound(false);
          } else {
            setNotFound(true);
          }
          return;
        }

        const match = findChildBySlug(kids, slug);
        if (match) {
          setSelectedChild(match);
          setDisplayName(undefined);
          setNotFound(false);
          setDeviceProfileId(match.id);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [slug, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Sparkles className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }

  if (notFound || loadError) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex flex-col">
        <header className="border-b border-border/70 bg-card/80 p-4 flex items-center justify-between">
          <HomewardLogo />
          <ThemeToggle />
        </header>
        <main className="mx-auto max-w-md p-8 text-center flex-1 flex flex-col justify-center animate-pop-in">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold mb-2">
            {loadError ? "Can't reach Homeward" : "Profile not found"}
          </h1>
          <p className="text-muted-foreground text-sm mb-6">
            {loadError
              ? "Make sure the Homeward computer is on and you're on the same Wi‑Fi."
              : `We couldn't find a chat profile for “${slug}”.`}
          </p>
          <div className="flex flex-col gap-3">
            <Link href="/chat?pick=1">
              <Button className="w-full rounded-xl">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Pick a profile
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
      displayName={displayName}
      quickChat={slug.toLowerCase() === QUICK_CHAT_SLUG}
      onSwitchProfile={() => router.push("/chat?pick=1")}
    />
  );
}

export default function ChildChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Sparkles className="h-8 w-8 animate-pulse text-primary" />
        </div>
      }
    >
      <ChildChatContent />
    </Suspense>
  );
}
