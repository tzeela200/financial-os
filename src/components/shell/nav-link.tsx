"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "./nav-items";

// Navigation Item (21A §48): icon + clear name + active state; never icon-only.
export function NavLink({ item, variant }: { item: NavItem; variant: "sidebar" | "bottom" }) {
  const pathname = usePathname();
  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  const Icon = item.icon;
  return (
    <Link href={item.href} className={`nav-link nav-link--${variant}`} aria-current={active ? "page" : undefined}>
      <Icon aria-hidden="true" size={20} strokeWidth={1.75} />
      <span>{item.label}</span>
    </Link>
  );
}
