"use client";

import "@/components/ui/ui.css";

// Error state (19 screen states; 22A): a failure inside one workspace never takes down the shell. What happened, what is
// still fine, and what to do — stored data is not touched by a failed read.
export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="ws">
      <div className="error-state error-state--block" role="alert">
        <h1 className="card-title">לא הצלחנו לטעון את המסך הזה</h1>
        <p>המידע השמור לא נפגע — רק הטעינה הזו נכשלה. אפשר לנסות שוב, או לעבור למסך אחר מהתפריט.</p>
        <button type="button" className="btn btn-primary" onClick={reset}>לנסות שוב</button>
      </div>
    </div>
  );
}
