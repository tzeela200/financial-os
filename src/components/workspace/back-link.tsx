import Link from "next/link";
import { ChevronRight } from "lucide-react";

// Back navigation (22A §32, 21C §42): every nested screen shows a clear way back to its parent context.
// In RTL "back" points to the right; 48px touch target (21A §13).
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="back-link" data-testid="back-link">
      <ChevronRight aria-hidden="true" size={20} />
      <span>{label}</span>
    </Link>
  );
}
