import { signOut } from "./login/actions";

// Authenticated shell only (Gate 1). Route A workspaces replace this per ADR-007 — no financial numbers here.
export default function Home() {
  return (
    <main style={{ padding: "var(--spacing-6)" }}>
      <p>מחוברת</p>
      <form action={signOut}>
        <button type="submit">יציאה</button>
      </form>
    </main>
  );
}
