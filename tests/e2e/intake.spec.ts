import { test, expect, type Page } from "@playwright/test";

// Intake (docs/plans/route-a-02-intake.md Task 5): file, duplicate, pasted text, manual report, back navigation.
async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(process.env.E2E_OWNER_EMAIL!);
  await page.getByLabel("סיסמה").fill(process.env.E2E_OWNER_PASSWORD!);
  await page.getByRole("button", { name: "כניסה" }).click();
  await page.waitForURL(/\/$/);
}

test("bank workspace: back link, upload a CSV, then the same file is marked as duplicate", async ({ page }, info) => {
  await signIn(page);
  await page.goto("/sources/bank");
  await expect(page.getByTestId("back-link")).toHaveAttribute("href", "/sources");

  const csv = { name: "bank-2026-09.csv", mimeType: "text/csv", buffer: Buffer.from(`date,amount\n2026-09-01,100\n# ${info.project.name}\n`) };
  await page.locator('input[type="file"]').setInputFiles(csv);
  await page.getByRole("button", { name: /קליטת 1 קבצים/ }).click();
  await expect(page.getByTestId("upload-result").first()).toContainText("הקובץ נקלט ונשמר כפי שהוא", { timeout: 20_000 });

  await page.locator('input[type="file"]').setInputFiles({ ...csv, name: "bank-copy.csv" });
  await page.getByRole("button", { name: /קליטת 1 קבצים/ }).click();
  await expect(page.getByTestId("upload-result").first()).toContainText("עותק זהה", { timeout: 20_000 });

  await page.reload();
  await expect(page.getByTestId("source-files")).toContainText("bank-2026-09.csv");
  await expect(page.getByTestId("source-files")).toContainText("נקלט — ממתין לעיבוד");
  await page.screenshot({ path: `test-results/visual/source-bank-${info.project.name}.png`, fullPage: true });
});

test("other source: pasted correspondence text and a manual report (never shown as verified)", async ({ page }, info) => {
  await signIn(page);
  await page.goto("/sources");
  await page.getByTestId("other-source-entry").click();
  await expect(page.getByRole("heading", { name: "מקור נוסף", level: 1 })).toBeVisible();
  await expect(page.getByTestId("back-link")).toBeVisible();

  // default type is manual report
  await page.getByLabel("על מה הדיווח").selectOption("debts");
  await page.getByLabel("מה קרה").fill(`חוב חדש לספק — ${info.project.name}`);
  await page.getByRole("button", { name: "שמירת הדיווח" }).click();
  await expect(page.getByTestId("manual-report-result")).toContainText("טרם אומת");

  await page.getByTestId("other-source-type").selectOption("correspondence");
  await page.getByRole("radio", { name: "טקסט מודבק" }).click();
  await page.getByLabel("טקסט המקור").fill(`שלום, מצורף אישור ההסדר. ${info.project.name}`);
  await page.getByRole("button", { name: "קליטת הטקסט" }).click();
  await expect(page.getByTestId("text-intake-result")).toContainText("הטקסט נקלט");
  await page.screenshot({ path: `test-results/visual/other-source-${info.project.name}.png`, fullPage: true });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("home reflects the intake: sources received and a file waiting for processing", async ({ page }) => {
  await signIn(page);
  await expect(page.getByTestId("kpi-bank")).toContainText("ממתינים לעיבוד");
  await expect(page.getByText(/נקלטו\s*1\s*מתוך\s*5\s*מקורות/)).toBeVisible();
});
