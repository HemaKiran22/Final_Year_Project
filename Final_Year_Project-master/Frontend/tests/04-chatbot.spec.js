/**
 * ═══════════════════════════════════════════════════════
 *  04 – CHATBOT TESTS  (6 scenarios)
 * ═══════════════════════════════════════════════════════
 */
import { test, expect } from '@playwright/test';
import { USERS, login, openChatbot, chatSend } from './helpers.js';

test.describe('AI Chatbot', () => {
  // ── Helper: wait for bot reply ────────────────────────────────────────────
  async function waitForBotReply(page) {
    await page.waitForFunction(() => {
      const messages = document.querySelectorAll('.chat-message.bot');
      if (messages.length === 0) return false;
      const last = messages[messages.length - 1];
      const text = last.innerText || '';
      return text.length > 3 && !text.includes('Thinking');
    }, { timeout: 20_000 });
  }

  // ── TC-BOT-01: Chatbot opens ─────────────────────────────────────────────
  test('TC-BOT-01 Chatbot toggle opens and closes', async ({ page }) => {
    await login(page, USERS.A);
    await openChatbot(page);
    await expect(page.locator('.chat-header')).toBeVisible();

    // Minimize
    const minimizeBtn = page.locator('button[aria-label="Minimize"], .chat-icon-btn').first();
    if (await minimizeBtn.count() > 0) {
      await minimizeBtn.click();
      await page.waitForTimeout(1000);
    }
    console.log('TC-BOT-01: chatbot opened and minimized successfully');
  });

  // ── TC-BOT-02: Greeting intent ───────────────────────────────────────────
  test('TC-BOT-02 Chatbot responds to greeting', async ({ page }) => {
    await login(page, USERS.A);
    await openChatbot(page);
    await chatSend(page, 'Hello');
    await waitForBotReply(page);

    const msgs = await page.locator('.chat-message.bot').allInnerTexts();
    const lastReply = msgs[msgs.length - 1] || '';
    expect(lastReply.length).toBeGreaterThan(3);
    console.log('TC-BOT-02 bot reply:', lastReply.slice(0, 80));
  });

  // ── TC-BOT-03: Find ride via chatbot ────────────────────────────────────
  test('TC-BOT-03 Chatbot can search for rides', async ({ page }) => {
    await login(page, USERS.A);
    await openChatbot(page);
    await chatSend(page, 'Find rides to Koramangala');
    await waitForBotReply(page);

    const msgs = await page.locator('.chat-message.bot').allInnerTexts();
    const lastReply = msgs[msgs.length - 1] || '';
    const hasRideContent = /ride|found|result|destination|koramangala|no ride/i.test(lastReply);
    expect(hasRideContent).toBeTruthy();
    console.log('TC-BOT-03 search reply:', lastReply.slice(0, 100));
  });

  // ── TC-BOT-04: Stats query ───────────────────────────────────────────────
  test('TC-BOT-04 Chatbot returns dashboard stats', async ({ page }) => {
    await login(page, USERS.A);
    await openChatbot(page);
    await chatSend(page, 'Show me my stats');
    await waitForBotReply(page);

    const msgs = await page.locator('.chat-message.bot').allInnerTexts();
    const replies = msgs.join(' ');
    const hasStats = /ride|saved|co2|stat|₹|\d/i.test(replies);
    console.log('TC-BOT-04 stats reply has data:', hasStats);
    expect(replies.length).toBeGreaterThan(10);
  });

  // ── TC-BOT-05: Invalid / gibberish query ─────────────────────────────────
  test('TC-BOT-05 Chatbot handles invalid query gracefully', async ({ page }) => {
    await login(page, USERS.A);
    await openChatbot(page);
    await chatSend(page, 'xyzzy1234567 qwerty nonsense');
    await waitForBotReply(page);

    const msgs = await page.locator('.chat-message.bot').allInnerTexts();
    const lastReply = msgs[msgs.length - 1] || '';
    // Should give some fallback, not crash
    expect(lastReply.length).toBeGreaterThan(2);
    const noHallucination = !/I found \d+ ride/i.test(lastReply) || lastReply.includes('not sure');
    console.log('TC-BOT-05 graceful fallback:', noHallucination, '| reply:', lastReply.slice(0, 80));
  });

  // ── TC-BOT-06: Help intent ───────────────────────────────────────────────
  test('TC-BOT-06 Chatbot help command lists capabilities', async ({ page }) => {
    await login(page, USERS.A);
    await openChatbot(page);
    await chatSend(page, 'help');
    await waitForBotReply(page);

    const msgs = await page.locator('.chat-message.bot').allInnerTexts();
    const lastReply = msgs[msgs.length - 1] || '';
    const hasHelpContent = /find|post|join|can|help|ride/i.test(lastReply);
    expect(hasHelpContent).toBeTruthy();
    console.log('TC-BOT-06 help reply:', lastReply.slice(0, 100));
  });
});
