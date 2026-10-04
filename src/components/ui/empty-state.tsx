import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// Empty State (21A): what is missing, why, and the way forward. Presentation only — the screen decides when it applies.
// tone "calm" = nothing open (a good state); "neutral" = nothing yet.
export function EmptyState({ icon: Icon, title, children, action, tone = "neutral", testId, role }: {
  icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode; tone?: "neutral" | "calm"; testId?: string; role?: "status";
}) {
  return (
    <div className={`card empty-state empty-state--${tone}`} data-testid={testId} role={role}>
      <span className="empty-state-icon" aria-hidden="true"><Icon size={20} /></span>
      <div className="empty-state-body">
        <p className="empty-state-title">{title}</p>
        {children ? <p className="empty-state-text">{children}</p> : null}
        {action ? <div className="empty-state-action">{action}</div> : null}
      </div>
    </div>
  );
}
