"use client";

import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api, type PairedDevice, type PairingInfo } from "@/lib/api";
import { parentLocalUrl } from "@/lib/local-host";
import { spokenHouseCode } from "@/lib/house-code";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Smartphone, Trash2 } from "lucide-react";

function formatWhen(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function AddPhoneCard({ showParentNote = false }: { showParentNote?: boolean }) {
  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [forgettingId, setForgettingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const info = await api.pairing();
    setPairing(info);
    setError("");
    return info;
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load house code."))
      .finally(() => setLoading(false));
  }, [load]);

  const rotate = async () => {
    setRotating(true);
    setError("");
    try {
      setPairing(await api.rotateHouseCode());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make a new house code.");
    } finally {
      setRotating(false);
    }
  };

  const forget = async (device: PairedDevice) => {
    setForgettingId(device.id);
    setError("");
    try {
      await api.forgetDevice(device.id);
      setPairing((current) =>
        current ? { ...current, devices: current.devices.filter((item) => item.id !== device.id) } : current,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't forget that device.");
    } finally {
      setForgettingId(null);
    }
  };

  const code = pairing?.house_code ?? "";
  const joinUrl = pairing?.join_url ?? null;

  return (
    <Card className="border-border/80 shadow-xs">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" />
          Add a phone or tablet
        </CardTitle>
        <CardDescription>
          Same Wi‑Fi as the Homeward computer — not a guest network or the internet. Scan the QR, or type the house
          code on a device that already opened the join page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading && <p className="text-sm text-muted-foreground">Loading house code…</p>}
        {error && (
          <p className="text-xs font-semibold text-destructive" role="alert">
            {error}
          </p>
        )}
        {pairing && (
          <>
            <div className="flex flex-col sm:flex-row gap-5 sm:items-start">
              <div className="mx-auto sm:mx-0 rounded-2xl border border-border/80 bg-white p-3">
                {joinUrl ? (
                  <QRCodeSVG
                    value={joinUrl}
                    size={168}
                    marginSize={2}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#0f172a"
                    title="QR code to join Homeward"
                  />
                ) : (
                  <div className="flex h-[168px] w-[168px] items-center justify-center p-3 text-center text-xs text-muted-foreground">
                    Couldn&apos;t detect this computer&apos;s address. Type the house code on the join page.
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-3 text-center sm:text-left">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">House code</p>
                <p
                  className="font-mono text-4xl sm:text-5xl font-bold tracking-[0.35em] text-foreground pl-[0.35em] sm:pl-0"
                  aria-label={`House code ${spokenHouseCode(code)}`}
                >
                  {code}
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Say it as digits. This is not a profile PIN.
                </p>
                {pairing.lan_ip && (
                  <p className="text-xs text-muted-foreground font-mono">
                    Can&apos;t scan? Last resort address: {pairing.lan_ip}
                    {pairing.port && pairing.port !== 80 ? `:${pairing.port}` : ""}
                  </p>
                )}
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={rotate}
              disabled={rotating}
              className="rounded-xl"
            >
              <RefreshCw className={`mr-1.5 h-4 w-4 ${rotating ? "animate-spin" : ""}`} />
              {rotating ? "Making a new code…" : "New house code"}
            </Button>
            <p className="text-xs text-muted-foreground -mt-3">
              The old unused code stops working. Phones already added stay until you forget them.
            </p>

            {pairing.devices.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Added devices</p>
                <ul className="space-y-2">
                  {pairing.devices.map((device) => (
                    <li
                      key={device.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{device.label}</p>
                        <p className="text-xs text-muted-foreground">
                          Added {formatWhen(device.created_at) || "just now"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="rounded-xl text-muted-foreground hover:text-destructive"
                        disabled={forgettingId === device.id}
                        onClick={() => forget(device)}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Forget
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        {showParentNote && (
          <p className="text-xs text-muted-foreground">
            On this computer, use <code className="font-mono">{parentLocalUrl()}</code> for setup and the parent
            dashboard.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
