// Display formatting for picture screens (20D; formatting only, no calculation).
const dateFmt = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric", timeZone: "UTC" });

export const dayLabel = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(`${iso.slice(0, 10)}T12:00:00Z`)) : "—");
export const monthLabel = (m: string | null | undefined) => (m ? monthFmt.format(new Date(`${m}-01T12:00:00Z`)) : "");
