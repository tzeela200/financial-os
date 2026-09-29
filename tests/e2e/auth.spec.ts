import { test, expect } from "@playwright/test";

test("unauthenticated visitor is redirected to login; root is Hebrew RTL", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
});

test("owner signs in and reaches the authenticated shell", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(process.env.E2E_OWNER_EMAIL!);
  await page.getByLabel("סיסמה").fill(process.env.E2E_OWNER_PASSWORD!);
  await page.getByRole("button", { name: "כניסה" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("מחוברת")).toBeVisible();
});

test("wrong password shows a clear Hebrew error, not a generic one", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(process.env.E2E_OWNER_EMAIL!);
  await page.getByLabel("סיסמה").fill("wrong-password-123");
  await page.getByRole("button", { name: "כניסה" }).click();
  await expect(page.getByRole("alert")).toContainText("פרטי הכניסה שגויים");
});

test("no horizontal page scroll on the login screen", async ({ page }) => {
  await page.goto("/login");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
