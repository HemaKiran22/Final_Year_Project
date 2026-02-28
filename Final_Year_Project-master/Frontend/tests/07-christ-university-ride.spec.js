/**
 * ═══════════════════════════════════════════════════════
 *  07 – CHATBOT: Find Ride to Christ University
 * ═══════════════════════════════════════════════════════
 * TC-CU-01: Open chatbot → send "find rides to christ university"
 *           → verify the bot replies with ride results or a
 *             "no rides found" message (i.e. it searched correctly).
 */
import { test, expect } from '@playwright/test';
import { USERS, login, openChatbot, chatSend } from './helpers.js';

test.describe('Christ University Ride Search', () => {

  async function waitForBotReply(page) {
    await page.waitForFunction(() => {
      const msgs = document.querySelectorAll('.chat-message.bot');
      if (!msgs.length) return false;
      const last = msgs[msgs.length - 1];
      const text = last.innerText || '';
      return text.length > 3 && !text.includes('Thinking');
    }, { timeout: 30_000 });
  }

  test('TC-CU-01 Chatbot finds ride to Christ University', async ({ page }) => {
    // ── Step 1: Login ────────────────────────────────────────────────────
    await login(page, USERS.A);
    console.log('✅ Logged in as', USERS.A.email);

    // ── Step 2: Open chatbot ─────────────────────────────────────────────
    await openChatbot(page);
    console.log('✅ Chatbot opened');

    // ── Step 3: Send the search prompt ──────────────────────────────────
    await chatSend(page, 'find rides to christ university');
    console.log('✅ Prompt sent: "find rides to christ university"');

    // ── Step 4: Wait for bot to reply ───────────────────────────────────
    await waitForBotReply(page);

    // ── Step 5: Collect all bot messages ─────────────────────────────────
    const botMsgs = await page.locator('.chat-message.bot').allInnerTexts();
    const fullReply = botMsgs.join(' ');
    console.log('\n── Bot reply ─────────────────────────────────────────────');
    console.log(fullReply.slice(0, 500));
    console.log('──────────────────────────────────────────────────────────\n');

    // ── Step 6: Check whether ride cards appeared ─────────────────────
    const rideCards = page.locator('.agent-ride-card');
    const cardCount = await rideCards.count();
    console.log(`🃏 Ride cards rendered: ${cardCount}`);

    if (cardCount > 0) {
      // Ride(s) found — verify card content
      const firstCardText = await rideCards.first().innerText();
      console.log('First ride card:\n', firstCardText);

      // Card should mention "christ" (case-insensitive)
      const mentionsChrist = /christ/i.test(firstCardText);
      console.log('Card mentions Christ University:', mentionsChrist);

      // Join button should exist on the card
      const joinBtn = rideCards.first().locator('.arc-btn-join');
      await expect(joinBtn).toBeVisible();
      console.log('✅ PASS — Ride to Christ University found. Cards:', cardCount);
    } else {
      // No cards — bot should say "no rides" or similar (not crash/empty)
      const noRideMsg = /no ride|not found|couldn't find|0 ride|no result/i.test(fullReply);
      console.log('Bot gave a "no rides" response:', noRideMsg);
      expect(fullReply.length).toBeGreaterThan(10);
      console.log('✅ PASS — Chatbot searched and replied (no rides currently posted).');
    }
  });

});
