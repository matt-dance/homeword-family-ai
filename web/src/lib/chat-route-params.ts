/** Safe readers for Next.js chat route params. `useParams`/`useSearchParams` can be null. */

export function slugFromParams(
  params: { slug?: string | string[] } | null | undefined,
): string {
  const slug = params?.slug;
  if (typeof slug === "string") return slug;
  if (Array.isArray(slug) && typeof slug[0] === "string") return slug[0];
  return "";
}

export function slugFromPathname(pathname?: string | null): string {
  if (!pathname) return "";
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "chat" || !parts[1]) return "";
  try {
    return decodeURIComponent(parts[1]);
  } catch {
    return parts[1];
  }
}

export function resolveChatSlug(
  params: { slug?: string | string[] } | null | undefined,
  pathname?: string | null,
): string {
  return slugFromParams(params) || slugFromPathname(pathname);
}

export function isForceProfilePick(
  searchParams: { get: (key: string) => string | null } | null | undefined,
  search?: string | null,
): boolean {
  if (searchParams?.get("pick") === "1") return true;
  if (!search) return false;
  const query = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(query).get("pick") === "1";
}
