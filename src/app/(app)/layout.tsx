import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";

// Every authenticated screen lives inside the canonical shell (22A §26). Auth is enforced by proxy.ts.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
