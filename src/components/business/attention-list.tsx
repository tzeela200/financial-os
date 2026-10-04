import Link from "next/link";
import { TriangleAlert, CircleAlert, Info, ChevronLeft } from "lucide-react";
import type { AttentionItem } from "@/features/picture/attention";

// Attention items (22A §72; 21B): a small number of material items, each a full-row link with severity icon, the
// reason and a call to action. Severity is carried by icon + text + border, never colour alone. Presentation only —
// the items, their order and severity come from the read model.
export function AttentionList({ items, max, moreHref = "/review", testId }: { items: AttentionItem[]; max?: number; moreHref?: string; testId?: string }) {
  const shown = max ? items.slice(0, max) : items;
  return (
    <ul className="card attention-list" data-testid={testId}>
      {shown.map((a) => {
        const Icon = a.tone === "err" ? CircleAlert : a.tone === "warn" ? TriangleAlert : Info;
        return (
          <li key={a.id} className={`attention-item tone-${a.tone}`}>
            <Link href={a.href}>
              <Icon className="attention-icon" size={20} aria-label={a.tone === "err" ? "תקלה" : a.tone === "warn" ? "דורש בדיקה" : "מידע"} />
              <span>{a.text}</span>
              <span className="attention-cta">לטיפול <ChevronLeft size={16} aria-hidden="true" /></span>
            </Link>
          </li>
        );
      })}
      {max && items.length > max ? (
        <li className="attention-item tone-info">
          <Link href={moreHref}>
            <Info className="attention-icon" size={20} aria-hidden="true" />
            <span>ועוד {items.length - max} פריטים בתור הבדיקה</span>
            <span className="attention-cta">לתור <ChevronLeft size={16} aria-hidden="true" /></span>
          </Link>
        </li>
      ) : null}
    </ul>
  );
}
