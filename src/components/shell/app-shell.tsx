import type { ReactNode } from "react";
import { NAV_ITEMS, NAV_GROUP_LABELS, BOTTOM_NAV_HREFS, MORE_NAV_HREFS, type NavItem, type NavGroup } from "./nav-items";
import { NavLink, NavIcon } from "./nav-link";
import { signOut } from "@/app/login/actions";
import "./shell.css";

function groupItems(items: NavItem[]) {
  const groups = new Map<NavGroup, NavItem[]>();
  for (const item of items) groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  return [...groups.entries()];
}
const byHref = (hrefs: string[]) => hrefs.map((h) => NAV_ITEMS.find((i) => i.href === h)!);

// Application Shell (22A §26–30, §82–83): desktop = sidebar + header + workspace; mobile = header + workspace + bottom nav.
// The sidebar holds no changing financial data (22A §27). Utility items (settings) sit in their own area (22A §22).
export function AppShell({ children }: { children: ReactNode }) {
  const main = NAV_ITEMS.filter((i) => i.group !== "utility");
  const utility = NAV_ITEMS.filter((i) => i.group === "utility");
  return (
    <div className="shell">
      <aside className="shell-sidebar" aria-label="ניווט ראשי">
        <div className="shell-brand">מערכת פיננסית</div>
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
            <button type="submit" className="btn btn-ghost">יציאה</button>
          </form>
        </div>
      </aside>

      <header className="shell-header">
        <div className="shell-header-brand">מערכת פיננסית</div>
        <form action={signOut} className="shell-header-signout">
          <button type="submit" className="btn btn-ghost">יציאה</button>
        </form>
      </header>

      <main className="shell-main" id="main">{children}</main>

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
