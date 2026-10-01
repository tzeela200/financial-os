// Navigation per chapter 22A §9 / §81 — every canonical item, in canonical groups and names (decision by Tzeela,
// 30.09.2026: show all 22A items; items without a built screen are marked and not linked, so no half-built screen
// is reachable — 23 §110, 23D §113). Release-2 workspaces (ADR-002) are marked as such.
// Icons are referenced by name (serializable across the server/client boundary).
export type NavIconName =
  | "house" | "gauge" | "calendar-clock" | "scale" | "arrow-left-right" | "file-text" | "wallet"
  | "git-compare" | "list-checks" | "history" | "piggy-bank" | "settings" | "ellipsis";
export type NavStatus = "built" | "soon" | "release2";
export type NavGroup = "state" | "activity" | "review" | "planning" | "utility";
export type NavItem = { href: string; label: string; icon: NavIconName; group: NavGroup; status: NavStatus; mobileLabel?: string };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "בית", icon: "house", group: "state", status: "built" },
  { href: "/snapshot", label: "תמונת מצב", mobileLabel: "מצב", icon: "gauge", group: "state", status: "built" },
  { href: "/future-money", label: "כספים עתידיים", icon: "calendar-clock", group: "state", status: "soon" },
  { href: "/obligations", label: "התחייבויות וחובות", icon: "scale", group: "state", status: "soon" },
  { href: "/transactions", label: "תנועות", icon: "arrow-left-right", group: "activity", status: "built" },
  { href: "/documents", label: "מסמכים", icon: "file-text", group: "activity", status: "soon" },
  { href: "/sources", label: "חשבונות ומקורות", mobileLabel: "מקורות", icon: "wallet", group: "activity", status: "built" },
  { href: "/reconciliation", label: "התאמות ומס", icon: "git-compare", group: "review", status: "soon" },
  { href: "/review", label: "תור בדיקה", mobileLabel: "בדיקה", icon: "list-checks", group: "review", status: "built" },
  { href: "/investigations", label: "חקירה היסטורית", mobileLabel: "חקירה", icon: "history", group: "review", status: "release2" },
  { href: "/planning", label: "תקציב והבראה", icon: "piggy-bank", group: "planning", status: "release2" },
  { href: "/settings", label: "הגדרות", icon: "settings", group: "utility", status: "soon" },
];

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  state: "מצב פיננסי",
  activity: "פעילות פיננסית",
  review: "בדיקה",
  planning: "תכנון",
  utility: "שירות",
};

export const NAV_STATUS_LABEL: Record<Exclude<NavStatus, "built">, string> = { soon: "בפיתוח", release2: "גרסה 2" };

// Mobile bottom navigation (22A §41): בית · מצב · תנועות · בדיקה · עוד. "עוד" holds the rest (22A §42).
export const BOTTOM_NAV_HREFS = ["/", "/snapshot", "/transactions", "/review"];
export const MORE_NAV_HREFS = ["/future-money", "/obligations", "/documents", "/sources", "/investigations", "/planning", "/settings"];
