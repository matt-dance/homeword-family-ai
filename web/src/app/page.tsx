"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { HomewardLogo } from "@/components/homeward-logo";
import { isParentSignedOut, parentRouteAfterSessionCheck } from "@/lib/parent-session";

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const go = (path: "/setup" | "/dashboard") => router.replace(path);
    api
      .setupStatus()
      .then(async (status) => {
        if (!status.has_parent || !status.setup_complete || isParentSignedOut()) {
          go("/setup");
          return;
        }
        try {
          await api.me();
          go(
            parentRouteAfterSessionCheck({
              setupComplete: true,
              hasParent: true,
              signedOut: isParentSignedOut(),
              meOk: true,
            }),
          );
        } catch {
          go("/setup");
        }
      })
      .catch(() => go("/setup"))
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
