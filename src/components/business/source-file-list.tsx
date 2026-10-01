import Link from "next/link";
import { FileText, FileSpreadsheet, FileImage, File } from "lucide-react";
import { pipelineStateLabel, type SourceFileRow } from "@/features/sources/source-files";

// File Item list (21A §58; 22B §68): name, type, date, size, processing state from the backend. On mobile each row
// stacks (21A §39 Mobile Data Card) — no horizontal scroll.
const dateFmt = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
const fmtSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

function iconFor(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["csv", "xlsx", "xls"].includes(ext)) return FileSpreadsheet;
  if (["png", "jpg", "jpeg", "webp", "heic"].includes(ext)) return FileImage;
  if (["pdf", "txt", "md", "docx", "eml"].includes(ext)) return FileText;
  return File;
}
function tone(state: string) {
  if (state === "failed") return "err";
  if (state === "needs_review" || state === "ready_for_review" || state === "duplicate") return "warn";
  if (state === "ready" || state === "verified") return "ok";
  if (state === "extracted") return "info";
  return "info";
}

export function SourceFileList({ files, emptyText }: { files: SourceFileRow[]; emptyText: string }) {
  if (files.length === 0) return <p className="card muted-note">{emptyText}</p>;
  return (
    <ul className="card file-list" data-testid="source-files">
      {files.map((f) => {
        const Icon = iconFor(f.name);
        return (
          <li key={f.id} className="file-row">
            <Icon aria-hidden="true" size={20} className="file-icon" />
            <div className="file-main">
              <Link href={`/sources/files/${f.id}`} className="file-name file-link">{f.name}</Link>
              <span className="file-meta"><span className="num">{dateFmt.format(new Date(f.uploadedAt))}</span> · <span className="num">{fmtSize(f.sizeBytes)}</span></span>
            </div>
            <span className={`badge badge--${tone(f.state)}`}>{pipelineStateLabel(f.state)}</span>
          </li>
        );
      })}
    </ul>
  );
}
