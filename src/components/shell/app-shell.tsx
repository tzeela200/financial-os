import type { ReactNode } from "react";
import { NAV_ITEMS, NAV_GROUP_LABELS, BOTTOM_NAV_HREFS, MORE_NAV_HREFS, type NavItem, type NavGroup } from "./nav-items";
import { NavLink, NavIcon } from "./nav-link";
import { signOut } from "@/app/login/actions";
import Link from "next/link";
import { LogOut, Upload, Search } from "lucide-react";
import "./shell.css";

function groupItems(items: NavItem[]) {
  const groups = new Map<NavGroup, NavItem[]>();
  for (const item of items) groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  return [...groups.entries()];
}
const byHref = (hrefs: string[]) => hrefs.map((h) => NAV_ITEMS.find((i) => i.href === h)!);

// Application Shell (22A §26–30, §82–83; Calm Finance ADR-011): desktop = sidebar + top bar + workspace;
// mobile = top bar + workspace + bottom nav. The sidebar holds no changing financial data (22A §27).
// Top bar: transaction search (the existing /transactions search — 22A §23 covers more and comes later) and the one
// global action, upload. Nothing that does not work yet is shown as an action (Calm Finance §5 "Future Modules").
export function AppShell({ children }: { children: ReactNode }) {
  const main = NAV_ITEMS.filter((i) => i.group !== "utility");
  const utility = NAV_ITEMS.filter((i) => i.group === "utility");
  return (
    <div className="shell">
      <a href="#main" className="skip-link">דלג לתוכן הראשי</a>
      <aside className="shell-sidebar" aria-label="ניווט ראשי">
        <div className="shell-sidebar-inner">
          <div className="shell-brand"><span className="shell-mark" aria-hidden="true">₪</span><span>מערכת פיננסית</span></div>
          <nav className="shell-nav">
            {groupItems(main).map(([group, items]) => (
              <div key={group} className="shell-nav-group">
                <div className="shell-nav-label">{NAV_GROUP_LABELS[group]}</div>
                {items.map((item) => (
                  <NavLink key={item.href} item={item} variant="sidebar" />
                ))}
              </div>
            ))}
          </nav>
          <div className="shell-utility">
            {utility.map((item) => (
              <NavLink key={item.href} item={item} variant="sidebar" />
            ))}
            <form action={signOut}>
              <button type="submit" className="shell-signout"><LogOut aria-hidden="true" size={20} strokeWidth={1.75} />יציאה</button>
            </form>
          </div>
        </div>
      </aside>

      <header className="shell-header">
        <div className="shell-header-brand"><span className="shell-mark" aria-hidden="true">₪</span>מערכת פיננסית</div>
        <form action="/search" method="get" role="search" className="shell-search">
          <label htmlFor="global-q" className="visually-hidden">חיפוש בכל המערכת</label>
          <Search aria-hidden="true" size={18} className="shell-search-icon" />
          <input dir="auto" id="global-q" name="q" type="search" className="shell-search-input" placeholder="חיפוש בכל המערכת" autoComplete="off" />
        </form>
        <div className="shell-header-actions">
          <Link href="/sources" className="btn btn-primary btn-icon-text"><Upload aria-hidden="true" size={18} />העלאת מסמך</Link>
        </div>
        <form action={signOut} className="shell-header-signout">
          <button type="submit" className="btn btn-ghost">יציאה</button>
        </form>
      </header>

      <main className="shell-main" id="main" tabIndex={-1}>{children}</main>

      <nav className="shell-bottom" aria-label="ניווט">
        {byHref(BOTTOM_NAV_HREFS).map((item) => (
          <NavLink key={item.href} item={item} variant="bottom" />
        ))}
        <details className="shell-more">
          <summary className="nav-link nav-link--bottom">
            <NavIcon name="ellipsis" />
            <span>עוד</span>
          </summary>
          <div className="shell-more-panel">
            {byHref(MORE_NAV_HREFS).map((item) => (
              <NavLink key={item.href} item={item} variant="more" />
            ))}
          </div>
        </details>
      </nav>
    </div>
  );
}
