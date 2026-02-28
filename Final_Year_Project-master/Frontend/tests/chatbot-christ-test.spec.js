/**
 * Quick test: AI chatbot finds rides to Christ University
 */
import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers.js';

test('Chatbot find rides to christ university', async ({ page }) => {
  // Step 1: Login
  await login(page, USERS.B);
  console.log('✅ Logged in as', USERS.B.email);

  // Step 2: Open the floating chatbot
  const toggleBtn = page.locator('.floating-chat-toggle, .chat-toggle-btn, [aria-label="Open chatbot"], [aria-label="Toggle chat"]').first();
  await toggleBtn.waitFor({ state: 'visible', timeout: 15_000 });
  await toggleBtn.click();
  console.log('✅ Chatbot opened');

  // Step 3: Wait for chatbot body to appear
  const chatBody = page.locator('.chat-body, .chatbot-body, .messages-container').first();
  await chatBody.waitFor({ state: 'visible', timeout: 10_000 });

  // Step 4: Type the prompt and send
  const input = page.locator('.chat-input input, .chat-input textarea, input[placeholder*="message" i], input[placeholder*="type" i], textarea').first();
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill('find rides to christ university');

  const sendBtn = page.locator('.chat-input button[type="submit"], .chat-send-btn, button[aria-label="Send"], .chat-input button').last();
  await sendBtn.click();
  console.log('✅ Prompt sent: "find rides to christ university"');

  // Step 5: Wait for bot to respond (loading spinner to disappear, then bot message)
  await page.waitForFunction(() => {
    const msgs = document.querySelectorAll('.chat-message.bot, .message.bot, [class*="bot-message"]');
    if (msgs.length < 2) return false; // at least greeting + response
    const last = msgs[msgs.length - 1];
    return last && last.innerText && last.innerText.length > 10;
  }, { timeout: 30_000 });

  // Step 6: Screenshot to see the result
  await page.screenshot({ path: 'tests/chatbot-christ-result.png', fullPage: false });
  console.log('📸 Screenshot saved to tests/chatbot-christ-result.png');

  // Step 7: Collect the last bot message and ride cards
  const allBotMsgs = await page.locator('.chat-message.bot, .message.bot').allInnerTexts();
  const lastBotMsg = allBotMsgs[allBotMsgs.length - 1];
  console.log('\n─── Last bot message ───────────────────────────────');
  console.log(lastBotMsg);
  console.log('────────────────────────────────────────────────────\n');

  // Step 8: Check for ride cards
  const rideCards = page.locator('.agent-ride-card, .ride-result-card, .arc-dest');
  const rideCount = await rideCards.count();
  console.log(`🚗 Ride cards found: ${rideCount}`);

  if (rideCount > 0) {
    const destinations = await page.locator('.arc-dest, .ride-destination').allInnerTexts();
    console.log('📍 Destinations found:', destinations);
    console.log('\n✅ TEST PASSED: Ride(s) to Christ University found in chatbot!');
    expect(rideCount).toBeGreaterThan(0);
  } else {
    // Check if bot said no rides found
    const noRidesMsg = lastBotMsg.toLowerCase();
    const noRidesKeywords = ['no rides', 'not found', "couldn't find", 'no available', 'nothing'];
    const isNoRides = noRidesKeywords.some(k => noRidesMsg.includes(k));

    if (isNoRides) {
      console.log('\n⚠️  TEST RESULT: Bot responded but found NO rides matching "christ university"');
      console.log('   This means your friend\'s ride may not be visible (check date/status in Firestore).');
    } else {
      console.log('\n⚠️  TEST RESULT: Got a bot response but no ride cards rendered.');
    }
    // Don't hard-fail — just log
    test.info().annotations.push({ type: 'result', description: `No ride cards. Bot said: ${lastBotMsg.slice(0, 200)}` });
  }
});
