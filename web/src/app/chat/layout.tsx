/**
 * Kid chat must not be statically prerendered. `/chat?pick=1` reads search
 * params; a static shell plus a null `useSearchParams()` was a client throw.
 */
export const dynamic = "force-dynamic";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
