import "@/components/ui/ui.css";

// Loading state (19 screen states; 22A §70): the shell stays, the workspace shows its skeleton. Nothing pretends to be
// a number — no amounts, no zeros, only shape.
export default function WorkspaceLoading() {
  return (
    <div className="ws" aria-busy="true" aria-live="polite">
      <p className="visually-hidden">טוען את מרחב העבודה…</p>
      <div className="skeleton skeleton--title" />
      <div className="skeleton-row">
        <div className="skeleton skeleton--card" />
        <div className="skeleton skeleton--card" />
        <div className="skeleton skeleton--card" />
      </div>
      <div className="skeleton skeleton--block" />
    </div>
  );
}
