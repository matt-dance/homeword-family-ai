"""Slug helpers shared with the gateway."""

export function slugifyName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "child";
}

export function chatPathForChild(child: { slug?: string; name: string }): string {
  return `/chat/${child.slug ?? slugifyName(child.name)}`;
}
