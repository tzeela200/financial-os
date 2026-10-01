import { test, expect, type Page } from "@playwright/test";

// Route A end to end with SYNTHETIC files only (no personal data): upload → processing job → mapping when the
// structure is new → canonical records → reconciliation candidate → Home / B1 / drill-down to the source row.
test.describe.configure({ mode: "serial" });

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(process.env.E2E_OWNER_EMAIL!);
  await page.getByLabel("סיסמה").fill(process.env.E2E_OWNER_PASSWORD!);
  await page.getByRole("button", { name: "כניסה" }).click();
  await page.waitForURL(/\/$/);
}

// desktop and mobile projects share one database: each uses its own month so their data never interact
const month = (p: string) => (p.includes("mobile") ? "08" : "07");

async function upload(page: Page, kind: string, name: string, body: string) {
  await page.goto(`/sources/${kind}`);
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(body) });
  await page.getByRole("button", { name: /קליטת 1 קבצים/ }).click();
  const result = page.getByTestId("upload-result").first();
  await expect(result).toContainText(/נכנס לעיבוד|עותק זהה/, { timeout: 30_000 });
  const link = result.getByRole("link", { name: "צפייה בנתוני הקובץ" });
  return (await link.count()) ? await link.getAttribute("href") : null;
}

/** Waits for the server-side job to finish (the page is reloaded; the browser is not the engine). */
async function settled(page: Page, href: string) {
  for (let i = 0; i < 40; i++) {
    await page.goto(href);
    const state = await page.getByTestId("file-state").textContent();
    if (state && !/בעיבוד|ממתין לעיבוד|בקריאה/.test(state)) return state;
    await page.waitForTimeout(1500);
  }
  throw new Error(`job did not settle: ${href}`);
}

async function mapIfNeeded(page: Page, href: string, concepts: string[], extra: (p: Page) => Promise<void>) {
  await settled(page, href);
  if (await page.getByTestId("needs-mapping").count()) {
    await page.getByRole("link", { name: "למסך המיפוי" }).click();
    for (const [i, c] of concepts.entries()) if (c) await page.getByTestId(`map-col-${i}`).selectOption(c);
    await extra(page);
    await page.getByTestId("save-mapping").click();
    await expect(page.getByRole("status")).toContainText("המיפוי נשמר", { timeout: 20_000 });
    await settled(page, href);
  }
  await expect(page.getByTestId("promoted")).not.toHaveText("0", { timeout: 30_000 });
}

test("bank file: mapping once, rows enter the picture, duplicate is marked", async ({ page }, info) => {
  await signIn(page);
  const m = month(info.project.name);
  const bank = `תאריך,תיאור,חובה,זכות,יתרה\n01/${m}/2026,משכורת ${info.project.name},,"5,000.00","5,500.00"\n11/${m}/2026,חיוב כרטיס,340.00,,"5,160.00"\n15/${m}/2026,קפה,100.00,,"5,060.00"\n`;
  const href = await upload(page, "bank", `bank-${info.project.name}.csv`, bank);
  expect(href).toBeTruthy();
  await mapIfNeeded(page, href!, ["transaction_date", "description", "debit_amount", "credit_amount", "balance"], async (p) => {
    await p.getByLabel("כל הסכומים בקובץ בשקלים (₪)").check();
  });
  await expect(page.getByTestId("promoted")).toHaveText("3");
  await expect(page.getByTestId("checks")).toContainText("רצף יתרות");

  const again = await upload(page, "bank", `bank-copy-${info.project.name}.csv`, bank);
  expect(again).toBeNull(); // identical bytes → duplicate, not processed twice
  await page.screenshot({ path: `test-results/visual/file-bank-${info.project.name}.png`, fullPage: true });
});

test("a second file with the same structure is read with the saved mapping (no question)", async ({ page }, info) => {
  await signIn(page);
  const m = month(info.project.name);
  const href = await upload(page, "bank", `bank-b-${info.project.name}.csv`, `תאריך,תיאור,חובה,זכות,יתרה\n20/${m}/2026,העברה ${info.project.name},,"10.00","5,070.00"\n`);
  await settled(page, href!);
  await expect(page.getByTestId("needs-mapping")).toHaveCount(0);
  await expect(page.getByTestId("promoted")).toHaveText("1");
});

test("card file joins the same picture; the bank card charge becomes a match candidate, not a second expense", async ({ page }, info) => {
  await signIn(page);
  const m = month(info.project.name);
  const card = `תאריך עסקה,בית עסק,סכום חיוב,תאריך חיוב\n02/${m}/2026,סופר ${info.project.name},300.00,10/${m}/2026\n05/${m}/2026,ספרים,40.00,10/${m}/2026\n`;
  const href = await upload(page, "credit-card", `card-${info.project.name}.csv`, card);
  await mapIfNeeded(page, href!, ["transaction_date", "supplier", "charge_amount", "charge_date"], async (p) => {
    await p.getByLabel(/סכום חיובי הוא חיוב/).check();
    await p.getByLabel("כל הסכומים בקובץ בשקלים (₪)").check();
  });

  await page.goto("/review");
  const item = page.getByTestId("candidates").locator("li").filter({ hasText: "חיוב כרטיס אשראי בבנק" }).filter({ hasText: "340" }).first();
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: /לאשר/ }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.locator("li").filter({ hasText: "חיוב כרטיס אשראי בבנק" }).filter({ hasText: "340" })).toHaveCount(0);
  await page.screenshot({ path: `test-results/visual/review-${info.project.name}.png`, fullPage: true });
});

test("Home and B1 show the same reconciled number, and it drills down to the source row", async ({ page }, info) => {
  await signIn(page);
  const m = `2026-${month(info.project.name)}`;
  await page.goto(`/snapshot?month=${m}`);
  const out = page.locator('a[href*="metric=money_out&"]').first();
  await expect(out).toContainText("440"); // card 340 + bank 100; the bank card charge (340) is not counted twice
  await out.click();
  await expect(page.getByTestId("detail-total")).toContainText("440");
  await expect(page.getByRole("heading", { name: /לא נספרו/ })).toBeVisible();
  await page.getByTestId("detail-rows").first().getByRole("link").first().click();
  await expect(page.getByTestId("source-row")).toBeVisible();
  await expect(page.getByRole("link", { name: /\.csv$/ })).toBeVisible();

  await page.goto("/");
  await expect(page.getByTestId("first-use")).toHaveCount(0);
  await expect(page.getByTestId("metric-current-money")).not.toContainText("לא ידוע");
  await page.goto("/transactions");
  await expect(page.getByTestId("transactions-table")).toBeVisible();
  await page.screenshot({ path: `test-results/visual/snapshot-${info.project.name}.png`, fullPage: true });
});

test("other source: pasted correspondence text and a manual report (never shown as verified)", async ({ page }, info) => {
  await signIn(page);
  await page.goto("/sources");
  await page.getByTestId("other-source-entry").click();
  await expect(page.getByRole("heading", { name: "מקור נוסף", level: 1 })).toBeVisible();
  await expect(page.getByTestId("back-link")).toBeVisible();
  await page.getByLabel("על מה הדיווח").selectOption("debts");
  await page.getByLabel("מה קרה").fill(`חוב חדש לספק — ${info.project.name}`);
  await page.getByRole("button", { name: "שמירת הדיווח" }).click();
  await expect(page.getByTestId("manual-report-result")).toContainText("טרם אומת");
  await page.getByTestId("other-source-type").selectOption("correspondence");
  await page.getByRole("radio", { name: "טקסט מודבק" }).click();
  await page.getByLabel("טקסט המקור").fill(`שלום, מצורף אישור ההסדר. ${info.project.name}`);
  await page.getByRole("button", { name: "קליטת הטקסט" }).click();
  await expect(page.getByTestId("text-intake-result")).toContainText("הטקסט נקלט");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
