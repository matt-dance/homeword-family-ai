"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ParentNav } from "@/components/parent-nav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.me()
      .then(() => setReady(true))
      .catch(() => router.replace("/setup"));
  }, [router]);

  const handleLogout = async () => {
    await api.logout();
    router.replace("/setup");
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <ParentNav onLogout={handleLogout} />
      {children}
    </div>
  );
}
