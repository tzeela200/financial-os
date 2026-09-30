import type { ReactNode } from "react";
import { NAV_ITEMS, NAV_GROUP_LABELS, type NavItem } from "./nav-items";
import { NavLink } from "./nav-link";
import { signOut } from "@/app/login/actions";
import "./shell.css";

function groupItems(items: NavItem[]) {
  const groups = new Map<NavItem["group"], NavItem[]>();
  for (const item of items) groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  return [...groups.entries()];
}

// Application Shell (22A §26–30, §82–83): desktop = sidebar + header + workspace; mobile = header + workspace + bottom nav.
// The sidebar holds no changing financial data (22A §27).
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <aside className="shell-sidebar" aria-label="ניווט ראשי">
        <div className="shell-brand">מערכת פיננסית</div>
        <nav className="shell-nav">
          {groupItems(NAV_ITEMS).map(([group, items]) => (
            <div key={group} className="shell-nav-group">
              {NAV_GROUP_LABELS[group] ? <div className="shell-nav-label">{NAV_GROUP_LABELS[group]}</div> : null}
              {items.map((item) => (
                <NavLink key={item.href} item={item} variant="sidebar" />
              ))}
            </div>
          ))}
        </nav>
        <form action={signOut} className="shell-signout">
          <button type="submit" className="btn btn-ghost">יציאה</button>
        </form>
      </aside>

      <header className="shell-header">
        <div className="shell-header-brand">מערכת פיננסית</div>
        <form action={signOut} className="shell-header-signout">
          <button type="submit" className="btn btn-ghost">יציאה</button>
        </form>
      </header>

      <main className="shell-main" id="main">{children}</main>

      <nav className="shell-bottom" aria-label="ניווט">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} variant="bottom" />
        ))}
      </nav>
    </div>
  );
}
