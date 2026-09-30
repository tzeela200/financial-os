// Object path inside financial-source-files: {owner_uid}/{source_id}/{file_id}/original.{ext} (migration 019).
// The original filename is metadata only; it never shapes the path (18D §31–32).
export function extensionFor(filename: string, mime: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(filename);
  if (m) return m[1].toLowerCase();
  if (mime === "text/plain") return "txt";
  return "bin";
}

export function sourceObjectPath(uid: string, sourceId: string, fileId: string, filename: string, mime: string): string {
  return `${uid}/${sourceId}/${fileId}/original.${extensionFor(filename, mime)}`;
}

// Date in the user's timezone (18A §12: timezone Asia/Jerusalem), yyyy-mm-dd.
const israelDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" });

export function pastedTextFilename(now: Date): string {
  return `טקסט-מודבק-${israelDate.format(now)}.txt`;
}
