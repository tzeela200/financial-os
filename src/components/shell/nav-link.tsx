"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House, Gauge, CalendarClock, Scale, ArrowLeftRight, FileText, Wallet, GitCompareArrows, ListChecks, History, PiggyBank,
  Settings, Ellipsis, type LucideIcon,
} from "lucide-react";
import { NAV_STATUS_LABEL, type NavIconName, type NavItem } from "./nav-items";

const ICONS: Record<NavIconName, LucideIcon> = {
  house: House, gauge: Gauge, "calendar-clock": CalendarClock, scale: Scale, "arrow-left-right": ArrowLeftRight,
  "file-text": FileText, wallet: Wallet, "git-compare": GitCompareArrows, "list-checks": ListChecks, history: History,
  "piggy-bank": PiggyBank, settings: Settings, ellipsis: Ellipsis,
};

export function NavIcon({ name }: { name: NavIconName }) {
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" size={20} strokeWidth={1.75} />;
}

// Navigation Item (21A §48): icon + clear name + active state; never icon-only. An item without a built screen is
// shown with a text status and is not a link (no dead end, no half-built screen).
export function NavLink({ item, variant }: { item: NavItem; variant: "sidebar" | "bottom" | "more" }) {
  const pathname = usePathname();
  const label = variant === "bottom" ? item.mobileLabel ?? item.label : item.label;
  if (item.status !== "built") {
    return (
      <span className={`nav-link nav-link--${variant} nav-link--soon`} aria-disabled="true">
        <NavIcon name={item.icon} />
        <span>{label}</span>
        <span className="nav-soon">{NAV_STATUS_LABEL[item.status]}</span>
      </span>
    );
  }
  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  return (
    <Link href={item.href} className={`nav-link nav-link--${variant}`} aria-current={active ? "page" : undefined}>
      <NavIcon name={item.icon} />
      <span>{label}</span>
    </Link>
  );
}
