import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// Empty State (21A): what is missing, why, and the way forward. Presentation only — the screen decides when it applies.
// tone "calm" = nothing open (a good state); "neutral" = nothing yet.
// size "compact": one line inside a section that has nothing yet — it does not take the space of real content.
export function EmptyState({ icon: Icon, title, children, action, tone = "neutral", size = "regular", testId, role }: {
  icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode; tone?: "neutral" | "calm"; size?: "regular" | "compact"; testId?: string; role?: "status";
}) {
  return (
    <div className={`card empty-state empty-state--${tone}${size === "compact" ? " empty-state--compact" : ""}`} data-testid={testId} role={role}>
      <span className="empty-state-icon" aria-hidden="true"><Icon size={20} /></span>
      <div className="empty-state-body">
        <p className="empty-state-title">{title}</p>
        {children ? <p className="empty-state-text">{children}</p> : null}
        {action ? <div className="empty-state-action">{action}</div> : null}
      </div>
    </div>
  );
}
