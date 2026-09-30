import type { LucideIcon } from "lucide-react";
import { House, Wallet } from "lucide-react";

// Navigation per chapter 22A §9 / §81. Only workspaces that have a real screen are listed (gap G-5):
// items are added as their screens are built. Names match chapter 22A exactly.
export type NavItem = { href: string; label: string; icon: LucideIcon; group: "home" | "state" | "activity" | "review" };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "בית", icon: House, group: "home" },
  { href: "/sources", label: "חשבונות ומקורות", icon: Wallet, group: "activity" },
];

export const NAV_GROUP_LABELS: Record<NavItem["group"], string | null> = {
  home: null,
  state: "מצב פיננסי",
  activity: "פעילות פיננסית",
  review: "בדיקה",
};
