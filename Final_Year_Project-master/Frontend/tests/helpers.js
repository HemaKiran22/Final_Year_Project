/**
 * Shared credentials, helpers, and utilities for all Playwright tests.
 */

// ─── Test accounts ─────────────────────────────────────────────────────────
export const USERS = {
  A: { email: 'nishtha@gmail.com',  password: 'nishtha@2173', name: 'Nishtha' },
  B: { email: 'testuser@gmail.com', password: '2173@Kiran',   name: 'testuser' },
};

export const BASE_URL = 'https://final-year-project-swart-gamma.vercel.app';

// ─── Future-safe dates ───────────────────────────────────────────────────────
export function futureDate(daysAhead = 3) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

export function pastDate(daysBack = 2) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().split('T')[0];
}

// ─── Login helper ───────────────────────────────────────────────────────────
/**
 * Navigate to the Landing page (root URL always works on Vercel), then click
 * the Login button for client-side SPA navigation to /login, fill credentials
 * and wait for the Dashboard to load.
 * Direct goto('/login') returns 404 because the Vercel deployment does not
 * serve sub-routes server-side.
 */
export async function login(page, user) {
  // Always start from root — the SPA bundle loads here without a 404
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // Wait for the landing page header Login button
  const loginBtn = page.locator('.auth-button.login, a.cta-login-btn, a[href="/login"]').first();
  await loginBtn.waitFor({ state: 'visible', timeout: 15_000 });
  await loginBtn.click();
  // React Router does a client-side push to /login — wait for the form
  await page.waitForSelector('input[name="email"]', { timeout: 15_000 });
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(user.password);
  await page.locator('button[type="submit"]').click();
  // App has a 2 s setTimeout before navigate('/dashboard') + Firebase auth check
  await page.waitForURL('**/dashboard', { timeout: 40_000 });
}

// ─── Logout helper ──────────────────────────────────────────────────────────
export async function logout(page) {
  // Dashboard sidebar has a div.menu-item with text "Logout"
  try {
    const logoutItem = page.locator('.menu-item', { hasText: /Logout/i });
    if (await logoutItem.count() > 0) {
      await logoutItem.first().click();
    } else {
      // Fallback: navigate to root (direct /login goto returns 404 on Vercel)
      await page.goto('/', { waitUntil: 'domcontentloaded' });
    }
  } catch {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  }
  await page.waitForURL('**/login', { timeout: 20_000 }).catch(() => {});
}

// ─── Open chatbot ────────────────────────────────────────────────────────────
export async function openChatbot(page) {
  const toggleBtn = page.locator('.floating-chat-toggle, [aria-label="Open chat"]');
  if (await toggleBtn.isVisible()) await toggleBtn.click();
  await page.locator('.chat-header').waitFor({ timeout: 8_000 });
}

// ─── Send chatbot message ─────────────────────────────────────────────────────
export async function chatSend(page, text) {
  const input = page.locator('.chat-input input');
  await input.fill(text);
  await page.locator('.chat-input button[type="submit"], .chat-input button').last().click();
  // Wait a bit for bot response
  await page.waitForTimeout(2500);
}

// ─── Wait for toast / success message ────────────────────────────────────────
export async function waitForSuccess(page, text, timeout = 12_000) {
  await page.locator(`text=${text}`).first().waitFor({ timeout });
}
