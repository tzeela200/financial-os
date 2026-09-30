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

test("navigation reaches Accounts & Sources and each Route A source workspace", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "חשבונות ומקורות" }).first().click();
  await expect(page.getByRole("heading", { name: "חשבונות ומקורות", level: 1 })).toBeVisible();
  for (const name of ["בנק וחשבונות עו״ש", "כרטיסי אשראי", "bit", "חשבונית ירוקה — הכנסות", "חשבונית ירוקה — הוצאות"]) {
    await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  }
  await page.getByRole("link", { name: /כרטיסי אשראי/ }).click();
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
