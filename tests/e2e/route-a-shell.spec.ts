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
  await expect(page.getByText("לא ידוע").first()).toBeVisible();
  await expect(page.locator(".metric-value .money").filter({ hasText: /^0 ₪$/ })).toHaveCount(0);
});

test("Home control center: trust bar, five Route A source cards with per-source upload, attention, progress", async ({ page }) => {
  await signIn(page);
  const trust = page.getByRole("region", { name: "סרגל אמינות" });
  for (const label of ["כיסוי", "עדכון אחרון", "אימות", "בקרת איכות", "לבדיקה"]) {
    await expect(trust.getByText(label, { exact: true })).toBeVisible();
  }
  for (const id of ["kpi-bank", "kpi-credit-card", "kpi-bit", "kpi-green-invoice", "kpi-documents"]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  // per-source upload entry points, no generic upload
  await expect(page.getByTestId("kpi-bank").getByRole("link", { name: "העלאת קובץ בנק" })).toHaveAttribute("href", "/sources/bank");
  await expect(page.getByTestId("kpi-green-invoice").getByRole("link", { name: "העלאת קובץ הכנסות מחשבונית ירוקה" })).toHaveAttribute("href", "/sources/green-invoice-income");
  await expect(page.getByRole("link", { name: "העלאת מקור" })).toHaveCount(0);
  // attention: one item for the empty system, linking to Accounts & Sources (22A §72 small number)
  await expect(page.getByTestId("attention-list").getByRole("link", { name: "עדיין לא נקלט אף מקור של מסלול A" })).toHaveAttribute("href", "/sources");
  // progress without an invented percentage (23B §27)
  await expect(page.getByText(/נקלטו\s*0\s*מתוך\s*5\s*מקורות/)).toBeVisible();
  await expect(page.getByText(/%/)).toHaveCount(0);
  // visual QA evidence (21C §88): full-page screenshot per viewport, uploaded as a CI artifact
  await page.screenshot({ path: `test-results/visual/home-${test.info().project.name}.png`, fullPage: true });
});

test("navigation shows all 22A items; unbuilt ones are marked and are not links", async ({ page }) => {
  await signIn(page);
  const sidebar = page.getByRole("complementary", { name: "ניווט ראשי" });
  if (await sidebar.isVisible()) {
    await expect(sidebar.getByText("התאמות ומס")).toBeVisible();
    await expect(sidebar.getByRole("link", { name: /התאמות ומס/ })).toHaveCount(0);
    await expect(sidebar.getByText("גרסה 2").first()).toBeVisible();
  } else {
    await page.getByText("עוד", { exact: true }).click();
    await expect(page.getByRole("link", { name: "חשבונות ומקורות" }).filter({ visible: true }).first()).toBeVisible();
  }
});

test("navigation reaches Accounts & Sources and each Route A source workspace", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "חשבונות ומקורות" }).filter({ visible: true }).first().click();
  await expect(page.getByRole("heading", { name: "חשבונות ומקורות", level: 1 })).toBeVisible();
  for (const name of ["בנק וחשבונות עו״ש", "כרטיסי אשראי", "bit", "חשבונית ירוקה — הכנסות", "חשבונית ירוקה — הוצאות"]) {
    await expect(page.getByRole("link", { name: new RegExp(name) }).filter({ visible: true }).first()).toBeVisible();
  }
  await page.getByRole("main").getByRole("link", { name: /כרטיסי אשראי/ }).first().click();
  await expect(page.getByRole("heading", { name: "כרטיסי אשראי", level: 1 })).toBeVisible();
});

test("no horizontal page scroll on Home and Sources", async ({ page }) => {
  await signIn(page);
  for (const path of ["/", "/sources", "/sources/bank"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow, path).toBe(false);
  }
});
