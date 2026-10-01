import { test, expect, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(process.env.E2E_OWNER_EMAIL!);
  await page.getByLabel("סיסמה").fill(process.env.E2E_OWNER_PASSWORD!);
  await page.getByRole("button", { name: "כניסה" }).click();
  await page.waitForURL(/\/$/);
}

test("Home first-use state explains what is missing and never shows zero money", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "עדיין אין תמונה פיננסית" })).toBeVisible();
  await expect(page.getByTestId("metric-current-money")).toContainText("לא ידוע");
  await expect(page.locator(".metric-value .money").filter({ hasText: /^0 ₪$/ })).toHaveCount(0);
});

test("Home control room order: picture → coming up → attention → data status → quick access (22A)", async ({ page }) => {
  await signIn(page);
  const headings = await page.getByRole("heading", { level: 2 }).allTextContents();
  const order = ["תמונת מצב", "קרוב בזמן", "דורש תשומת לב", "מצב המידע", "גישה מהירה"].map((h) => headings.findIndex((x) => x.startsWith(h)));
  expect(order.every((i) => i >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  const trust = page.getByRole("region", { name: "סרגל אמינות" });
  for (const label of ["כיסוי", "עדכון אחרון", "אימות", "בקרת איכות", "לבדיקה"]) await expect(trust.getByText(label, { exact: true })).toBeVisible();
  await expect(page.getByTestId("upcoming-empty")).toBeVisible();
  await expect(page.getByTestId("source-status")).toContainText("לא נקלט");
  await expect(page.getByText(/%/)).toHaveCount(0);
  await page.screenshot({ path: `test-results/visual/home-${test.info().project.name}.png`, fullPage: true });
});

test("navigation: built screens are links; unbuilt are marked", async ({ page }) => {
  await signIn(page);
  const sidebar = page.getByRole("complementary", { name: "ניווט ראשי" });
  if (await sidebar.isVisible()) {
    for (const name of ["תמונת מצב", "תנועות", "תור בדיקה", "חשבונות ומקורות"]) await expect(sidebar.getByRole("link", { name })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: /התאמות ומס/ })).toHaveCount(0);
    await expect(sidebar.getByText("גרסה 2").first()).toBeVisible();
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
