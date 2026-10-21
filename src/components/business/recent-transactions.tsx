import Link from "next/link";
import { ChevronLeft, ReceiptText } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Amount } from "@/components/ui/amount";
import { dayLabel } from "@/features/picture/format";
import type { RecentTx } from "@/features/home/home-extras";

// Recent movements — the same rows the transactions screen shows; each opens its record and returns to `back`.
export function RecentTransactions({ items, back }: { items: RecentTx[]; back: string }) {
  if (!items.length) return <EmptyState icon={ReceiptText} size="compact" title="תנועות יופיעו אחרי הקליטה הראשונה" />;
  return (
    <ul className="recent-list" data-testid="recent-transactions">
      {items.map((t) => (
        <li key={t.id}>
          <Link href={`/records/transaction/${t.id}?back=${encodeURIComponent(back)}`} className="recent-row">
            <span className="recent-date num">{dayLabel(t.date)}</span>
            <span className="recent-desc"><bdi>{t.description ?? "ללא תיאור"}</bdi><span className="recent-account">{t.account}</span></span>
            <span className={`recent-amount${t.direction === "credit" ? " fin-pos" : ""}`}><Amount value={t.direction === "debit" ? { ...t.amount, minor: (-BigInt(t.amount.minor)).toString() } : t.amount} /></span>
            <ChevronLeft size={16} aria-hidden="true" className="recent-chevron" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
