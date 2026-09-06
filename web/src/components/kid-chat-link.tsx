"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { chatPathForQuickChat } from "@/lib/default-profile";

type KidChatLinkProps = Omit<ComponentProps<typeof Link>, "href">;

/** Link to the anonymous household Quick Chat (no kid PIN). */
export function KidChatLink({ children, ...props }: KidChatLinkProps) {
  return (
    <Link href={chatPathForQuickChat()} {...props}>
      {children}
    </Link>
  );
}
