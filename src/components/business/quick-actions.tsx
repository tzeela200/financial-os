import Link from "next/link";
import { Upload, Search, ListChecks } from "lucide-react";
import { NAV_ITEMS, NAV_STATUS_LABEL } from "@/components/shell/nav-items";
import { NavIcon } from "@/components/shell/nav-link";

// Home actions: what works now, and every planned module beside it — visible, marked, not a link (owner's direction:
// the whole infrastructure stays on screen, 20–21.10.2026). The planned list comes from the navigation registry, so the
// home page and the sidebar never disagree about what is built.
const ACTIVE = [
  { href: "/sources", label: "העלאת מסמך", Icon: Upload },
  { href: "/transactions", label: "חיפוש תנועה", Icon: Search },
  { href: "/review", label: "תור בדיקה", Icon: ListChecks },
];

export function QuickActions() {
  const planned = NAV_ITEMS.filter((i) => i.status !== "built" && i.group !== "utility");
  return (
    <ul className="quick-actions" data-testid="quick-actions">
      {ACTIVE.map(({ href, label, Icon }) => (
        <li key={href}><Link href={href} className="quick-action"><Icon aria-hidden="true" size={20} strokeWidth={1.75} /><span>{label}</span></Link></li>
      ))}
      {planned.map((i) => (
        <li key={i.href}>
          <span className="quick-action quick-action--soon" aria-disabled="true">
            <NavIcon name={i.icon} /><span>{i.label}</span><span className="quick-action-status">{NAV_STATUS_LABEL[i.status as "soon" | "release2"]}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
