"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { HomewardLogo } from "@/components/homeward-logo";

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api.setupStatus()
      .then((status) => {
        if (!status.has_parent) {
          router.replace("/setup");
        } else if (!status.setup_complete) {
          router.replace("/setup");
        } else {
          router.replace("/dashboard");
        }
      })
      .catch(() => router.replace("/setup"))
      .finally(() => setChecking(false));
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <HomewardLogo />
      <p className="text-muted-foreground">
        {checking ? "Loading Homeward…" : "Redirecting…"}
      </p>
    </div>
  );
}
