import { test, expect, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(process.env.E2E_OWNER_EMAIL!);
  await page.getByLabel("סיסמה").fill(process.env.E2E_OWNER_PASSWORD!);
  await page.getByRole("button", { name: "כניסה" }).click();
  await page.waitForURL(/\/$/);
  // the workspace streams in behind its loading skeleton — wait for the screen itself, not only the URL
  await page.getByRole("heading", { level: 1 }).waitFor();
}

test("Home first-use state explains what is missing and never shows zero money", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "עדיין אין תמונה פיננסית" })).toBeVisible();
  await expect(page.getByTestId("metric-current-money")).toContainText("לא ידוע");
  await expect(page.locator(".metric-value .money").filter({ hasText: /^0 ₪$/ })).toHaveCount(0);
});

test("Home is the control room, in the canonical order: where I stand → coming up → attention → data basis → quick access (22A §6; 19D §3)", async ({ page }) => {
  await signIn(page);
  const headings = await page.getByRole("heading", { level: 2 }).allTextContents();
  const order = ["איפה את עומדת", "קרוב בזמן", "דורש תשומת לב", "על מה התמונה מבוססת", "פעולות"].map((h) => headings.findIndex((x) => x.startsWith(h)));
  expect(order.every((i) => i >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  const trust = page.getByRole("region", { name: "פירוט המקורות והעדכניות" });
  for (const label of ["מקורות", "מעודכן עד", "קבצים", "ממתין לך"]) await expect(trust.getByText(label, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "גישה מהירה" })).toHaveCount(0); // no duplicate entry points
  await expect(page.getByTestId("upcoming-empty")).toBeVisible();
  await expect(page.getByTestId("source-status")).toContainText("עוד לא הועלה");
  // every planned module is visible on Home, marked, and not a link (owner's direction 21.10.2026)
  const actions = page.getByTestId("quick-actions");
  await expect(actions.getByRole("link", { name: "העלאת מסמך" })).toBeVisible();
  await expect(actions.getByText("כספים עתידיים")).toBeVisible();
  await expect(actions.getByRole("link", { name: /כספים עתידיים/ })).toHaveCount(0);
  await expect(actions.getByText("תצוגה אישית / עסקית")).toBeVisible();
  // analysis is not repeated on Home (22A §74): month flows, trends, expenses by type and recent movements are in the Snapshot
  for (const t of ["metric-money-in", "metric-money-out", "recent-transactions", "expense-types"]) await expect(page.getByTestId(t)).toHaveCount(0);
  await expect(page.getByText(/%/)).toHaveCount(0);
  await page.screenshot({ path: `test-results/visual/home-${test.info().project.name}.png`, fullPage: true });
  await page.goto("/snapshot");
  // Snapshot = the analysis workspace (Calm Finance layout): trend with a period choice, planned KPI marked, no number
  await expect(page.getByRole("navigation", { name: "תקופת הגרף" })).toBeVisible();
  await expect(page.getByTestId("kpi-expected")).toContainText("בפיתוח");
  await expect(page.getByRole("heading", { name: "מצב המידע" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "תנועות אחרונות" })).toBeVisible();
  await expect(page.getByTestId("expense-types")).toBeVisible();
});

test("navigation: built screens are links; unbuilt are shown marked and are not links", async ({ page }) => {
  await signIn(page);
  const sidebar = page.getByRole("complementary", { name: "ניווט ראשי" });
  if (await sidebar.isVisible()) {
    for (const name of ["תמונת מצב", "תנועות", "תור בדיקה", "חשבונות ומקורות"]) await expect(sidebar.getByRole("link", { name })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: /התאמות ומס/ })).toHaveCount(0);
    await expect(sidebar.getByText("גרסה 2").first()).toBeVisible();
    await expect(sidebar.getByText("התאמות ומס")).toBeVisible();
  } else {
    await expect(page.getByRole("link", { name: "מצב" }).filter({ visible: true }).first()).toBeVisible();
    await page.getByText("עוד", { exact: true }).click();
    await expect(page.getByRole("link", { name: "חשבונות ומקורות" }).filter({ visible: true }).first()).toBeVisible();
  }
});

test("Accounts & Sources: financial accounts are separate from information sources", async ({ page }) => {
  await signIn(page);
  await page.goto("/sources");
  await expect(page.getByRole("heading", { name: "חשבונות פיננסיים" })).toBeVisible();
  for (const name of ["בנק וחשבונות עו״ש", "כרטיסי אשראי", "bit", "חשבונית ירוקה — הכנסות", "חשבונית ירוקה — הוצאות"]) {
    await expect(page.getByRole("link", { name: new RegExp(name) }).filter({ visible: true }).first()).toBeVisible();
  }
});

test("no horizontal page scroll on the main screens", async ({ page }) => {
  await signIn(page);
  for (const path of ["/", "/snapshot", "/transactions", "/review", "/sources", "/sources/bank"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow, path).toBe(false);
  }
});
