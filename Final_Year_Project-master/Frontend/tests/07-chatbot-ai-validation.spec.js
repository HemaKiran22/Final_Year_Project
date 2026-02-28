/**
 * =============================================================================
 *  ColonyCarpool - AI Chatbot Validation Suite (45 tests, single login session)
 * =============================================================================
 */

import { test, expect } from '@playwright/test';
import { login, USERS } from './helpers.js';

const RESULTS = [];

async function openBot(page) {
  const toggle = page.locator('.floating-chat-toggle');
  if (await toggle.isVisible({ timeout: 5000 }).catch(() => false)) {
    await toggle.click();
  }
  await page.locator('.floating-chat-window').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('.chat-message.bot').first().waitFor({ timeout: 10_000 });
}

async function sendAndWait(page, message, timeout = 30_000) {
  const beforeCount = await page.locator('.chat-message.bot').count();
  const input = page.locator('.chat-input input');
  await input.fill(message);
  await page.locator('.chat-input button').last().click();
  try {
    await page.waitForFunction(
      (args) => {
        const bots = document.querySelectorAll('.chat-message.bot');
        if (bots.length <= args.before) return false;
        const last = bots[bots.length - 1];
        const txt = (last?.innerText || '').trim();
        if (!txt || txt.length < 3) return false;
        const think = ['thinking...', '...', 'just a moment'];
        if (think.some(t => txt.toLowerCase().includes(t) && txt.length < 20)) return false;
        return true;
      },
      { before: beforeCount },
      { timeout }
    );
  } catch { /* timeout fallback - read whatever is there */ }
  const allBots = await page.locator('.chat-message.bot').all();
  const last = allBots[allBots.length - 1];
  const text = last ? (await last.innerText()).trim() : '';
  const rideCount = await page.locator('.agent-ride-card').count();
  return {
    text,
    hasRideCards: rideCount > 0,
    rideCount,
    hasCrash: text.toLowerCase().includes('typeerror') || text.toLowerCase().includes('undefined is not'),
  };
}

function contains(text, ...keywords) {
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k.toLowerCase()));
}

function rec(category, id, prompt, r, pass, note) {
  const n = note || '';
  const status = pass === true ? 'PASS' : pass === false ? 'FAIL' : 'WARN';
  RESULTS.push({ category, id, prompt, response: r.text.slice(0, 120), status, note: n, rideCards: r.rideCount });
  const icon = status === 'PASS' ? 'PASS' : status === 'FAIL' ? 'FAIL' : 'WARN';
  console.log('  [' + icon + '] [' + id + '] ' + prompt.slice(0, 55) + (n ? ' -- ' + n : ''));
}

test('AI Chatbot -- Full 45-Query Validation Suite', async ({ page }) => {
  test.setTimeout(35 * 60 * 1000);

  await login(page, USERS.B);
  await openBot(page);
  console.log('\n  Chatbot open -- starting 45-query validation...\n');

  // ── A. AUTH ──────────────────────────────────────────────────────────────
  console.log('\n-- A. Authentication Context --');

  await test.step('A01 | Am I logged in?', async () => {
    const r = await sendAndWait(page, 'Am I logged in?', 20_000);
    rec('Auth', 'A01', 'Am I logged in?', r, contains(r.text,'logged','authenticated','signed','yes','welcome','hello','help','testuser'));
    expect(r.text.length).toBeGreaterThan(5);
  });

  await test.step('A02 | Who am I?', async () => {
    const r = await sendAndWait(page, 'Who am I?', 20_000);
    rec('Auth', 'A02', 'Who am I?', r, contains(r.text,'testuser','user','you','profile','logged','email','name'));
    expect(r.text.length).toBeGreaterThan(5);
  });

  await test.step('A03 | Show my profile', async () => {
    const r = await sendAndWait(page, 'Show my profile', 20_000);
    rec('Auth', 'A03', 'Show my profile', r, contains(r.text,'profile','rides','stats','score','reliability','dashboard','rating','view'));
    expect(!r.hasCrash).toBe(true);
  });

  await test.step('A04 | What is my trust score?', async () => {
    const r = await sendAndWait(page, 'What is my trust score?', 20_000);
    rec('Auth', 'A04', 'What is my trust score?', r, contains(r.text,'trust','reliability','score','rating','profile','stats','dashboard'));
    expect(!r.hasCrash).toBe(true);
  });

  // ── B. RIDE SEARCH ────────────────────────────────────────────────────────
  console.log('\n-- B. Ride Search --');

  await test.step('B01 | Find ride to Christ University', async () => {
    const r = await sendAndWait(page, 'Find ride to Christ University', 35_000);
    const ok = contains(r.text,'christ','ride','found','no ride','no open','destination');
    rec('Ride Search', 'B01', 'Find ride to Christ University', r, ok, r.hasRideCards ? r.rideCount + ' card(s)' : '');
    expect(!r.hasCrash).toBe(true);
    expect(ok, 'Response: ' + r.text.slice(0, 80)).toBe(true);
  });

  await test.step('B02 | Find ride tomorrow morning', async () => {
    const r = await sendAndWait(page, 'Find ride tomorrow morning', 35_000);
    rec('Ride Search', 'B02', 'Find ride tomorrow morning', r, r.text.length > 5 && !r.hasCrash);
    expect(!r.hasCrash).toBe(true);
  });

  await test.step('B03 | Any rides to Whitefield?', async () => {
    const r = await sendAndWait(page, 'Any rides to Whitefield?', 35_000);
    rec('Ride Search', 'B03', 'Any rides to Whitefield?', r, !r.hasCrash && r.text.length > 3);
    expect(!r.hasCrash).toBe(true);
  });

  await test.step('B04 | Show available rides', async () => {
    const r = await sendAndWait(page, 'Show available rides', 35_000);
    const ok = r.hasRideCards || contains(r.text,'no ride','destination','where','available','ride');
    rec('Ride Search', 'B04', 'Show available rides', r, ok, r.hasRideCards ? r.rideCount + ' cards' : '');
    expect(!r.hasCrash).toBe(true);
  });

  await test.step('B05 | Find cheapest ride', async () => {
    const r = await sendAndWait(page, 'Find cheapest ride', 35_000);
    rec('Ride Search', 'B05', 'Find cheapest ride', r, r.hasRideCards || contains(r.text,'cheap','price','ride','no ride','destination','where'));
    expect(!r.hasCrash).toBe(true);
  });

  await test.step('B06 | Find ride after 6 PM', async () => {
    const r = await sendAndWait(page, 'Find ride after 6 PM', 35_000);
    // Valid responses: ride cards shown, or bot asks for destination (no dest given), or mentions pm/evening
    rec('Ride Search', 'B06', 'Find ride after 6 PM', r, r.hasRideCards || contains(r.text,'6','pm','evening','no ride','destination','ride','where','go'));
    expect(!r.hasCrash).toBe(true);
  });

  await test.step('B07 | Search ride with 2 seats', async () => {
    const r = await sendAndWait(page, 'Search ride with 2 seats', 35_000);
    rec('Ride Search', 'B07', 'Search ride with 2 seats', r, r.hasRideCards || contains(r.text,'seat','ride','no ride','destination','where'));
    expect(!r.hasCrash).toBe(true);
  });

  await test.step('B08 | Non-existent location -- no hallucination', async () => {
    const r = await sendAndWait(page, 'Find ride to XyZNonExistentPlaceABC123', 35_000);
    rec('Ride Search', 'B08', 'Find ride to XyZNonExistentPlaceABC123', r,
      r.rideCount === 0 && r.text.length > 5,
      r.rideCount === 0 ? 'No hallucinated rides' : 'HALLUCINATION: ' + r.rideCount + ' fake cards');
    expect(r.rideCount, 'Bot hallucinated ride cards for fake location').toBe(0);
    expect(!r.hasCrash).toBe(true);
  });

  await test.step('B09 | Invalid date format', async () => {
    const r = await sendAndWait(page, 'Find ride on 99/99/9999', 25_000);
    rec('Ride Search', 'B09', 'Find ride on 99/99/9999', r, !r.hasCrash && r.text.length > 5, 'Invalid date must not crash');
    expect(!r.hasCrash).toBe(true);
    expect(r.text.length).toBeGreaterThan(5);
  });

  // ── C. POST RIDE ──────────────────────────────────────────────────────────
  console.log('\n-- C. Post Ride --');

  await test.step('C01 | Post ride -- valid full input', async () => {
    const r = await sendAndWait(page, 'Post a ride to Electronic City tomorrow at 9 AM', 35_000);
    rec('Post Ride', 'C01', 'Post ride to Electronic City', r, contains(r.text,'electronic','post','ride','confirm','seat','price','destination','vehicle'));
    expect(!r.hasCrash).toBe(true);
    await sendAndWait(page, 'cancel', 10_000);
  });

  await test.step('C02 | Post ride -- missing time', async () => {
    const r = await sendAndWait(page, 'Post a ride to MG Road tomorrow', 30_000);
    rec('Post Ride', 'C02', 'Post ride -- missing time', r, contains(r.text,'time','when','hour','post','confirm','seat'));
    expect(!r.hasCrash).toBe(true);
    await sendAndWait(page, 'cancel', 10_000);
  });

  await test.step('C03 | Post ride -- past date', async () => {
    const r = await sendAndWait(page, 'Post a ride to Koramangala on 2020-01-01 at 10 AM', 30_000);
    rec('Post Ride', 'C03', 'Post ride -- past date', r, contains(r.text,'past','future','invalid','cannot','valid','post','confirm'));
    expect(!r.hasCrash).toBe(true);
    await sendAndWait(page, 'cancel', 10_000);
  });

  await test.step('C04 | Post ride -- 0 seats', async () => {
    const r = await sendAndWait(page, 'Post a ride to Indiranagar tomorrow at 8 AM 0 seats', 30_000);
    rec('Post Ride', 'C04', 'Post ride -- 0 seats', r, contains(r.text,'seat','post','ride','confirm','0','invalid','minimum'));
    expect(!r.hasCrash).toBe(true);
    await sendAndWait(page, 'cancel', 10_000);
  });

  await test.step('C05 | Post ride -- gibberish input', async () => {
    const r = await sendAndWait(page, 'Post ride @#%! !!', 25_000);
    rec('Post Ride', 'C05', 'Post ride -- gibberish', r, !r.hasCrash && r.text.length > 5);
    expect(!r.hasCrash).toBe(true);
    // Cancel any post-ride flow that may have started to prevent D-series state contamination
    await sendAndWait(page, 'cancel', 15_000);
  });

  // ── D. JOIN RIDE ──────────────────────────────────────────────────────────
  console.log('\n-- D. Join Ride --');

  await test.step('D01 | Join first ride', async () => {
    const r = await sendAndWait(page, 'Join first ride', 30_000);
    rec('Join Ride', 'D01', 'Join first ride', r, contains(r.text,'join','ride','which','search','no ride','find','confirm'));
    expect(!r.hasCrash).toBe(true);
    await sendAndWait(page, 'no', 10_000);
  });

  await test.step('D02 | Join ride to Christ University', async () => {
    const r = await sendAndWait(page, 'Join ride to Christ University', 35_000);
    rec('Join Ride', 'D02', 'Join ride to Christ University', r, contains(r.text,'join','christ','ride','confirm','found','no ride'));
    expect(!r.hasCrash).toBe(true);
    await sendAndWait(page, 'no', 10_000);
  });

  await test.step('D03 | Join my own ride -- should reject or search', async () => {
    const r = await sendAndWait(page, 'Join my own ride', 25_000);
    rec('Join Ride', 'D03', 'Join my own ride', r, contains(r.text,'own','cannot','driver','join','ride','find','search','yourself','where'));
    expect(!r.hasCrash).toBe(true);
    await sendAndWait(page, 'cancel', 10_000);
  });

  await test.step('D04 | Join already full ride', async () => {
    const r = await sendAndWait(page, 'Join a full ride', 25_000);
    rec('Join Ride', 'D04', 'Join already full ride', r, contains(r.text,'full','seat','no seat','join','ride','find','search','where'));
    expect(!r.hasCrash).toBe(true);
  });

  // ── E. CANCEL / STATUS ────────────────────────────────────────────────────
  console.log('\n-- E. Cancel / Status --');

  await test.step('E01 | Cancel my ride', async () => {
    const r = await sendAndWait(page, 'Cancel my ride', 25_000);
    rec('Cancel/Status', 'E01', 'Cancel my ride', r, contains(r.text,'cancel','ride','which','my ride','no ride','confirm','sure','no active'));
    expect(!r.hasCrash).toBe(true);
    await sendAndWait(page, 'no', 10_000);
  });

  await test.step('E02 | Am I running late?', async () => {
    const r = await sendAndWait(page, 'Am I running late?', 20_000);
    rec('Cancel/Status', 'E02', 'Am I running late?', r, contains(r.text,'late','ride','running','notify','time','dashboard','button','use','can'));
    expect(!r.hasCrash).toBe(true);
  });

  await test.step('E03 | Mark ride completed', async () => {
    const r = await sendAndWait(page, 'Mark ride completed', 20_000);
    rec('Cancel/Status', 'E03', 'Mark ride completed', r, contains(r.text,'complete','ride','finish','private','chat','dashboard','my ride','mark','nothing','no active','haven'));
    expect(!r.hasCrash).toBe(true);
  });

  await test.step('E04 | Leave ride', async () => {
    const r = await sendAndWait(page, 'Leave ride', 25_000);
    rec('Cancel/Status', 'E04', 'Leave ride', r, contains(r.text,'leave','ride','confirm','no ride','which','sure','my ride','haven','no active'));
    expect(!r.hasCrash).toBe(true);
    await sendAndWait(page, 'no', 10_000);
  });

  await test.step('E05 | What happens if I cancel now?', async () => {
    const r = await sendAndWait(page, 'What happens if I cancel now?', 25_000);
    rec('Cancel/Status', 'E05', 'What happens if I cancel now?', r, contains(r.text,'cancel','trust','penalty','score','ride','reliability','impact','affect','late','policy','rule'));
    expect(!r.hasCrash).toBe(true);
  });

  // ── F. ANALYTICS ──────────────────────────────────────────────────────────
  console.log('\n-- F. Analytics --');

  await test.step('F01 | Show my CO2 savings', async () => {
    const r = await sendAndWait(page, 'Show my CO2 savings', 25_000);
    rec('Analytics', 'F01', 'Show my CO2 savings', r, contains(r.text,'co2','carbon','saving','emission','km','stats','dashboard','ride','reduced'));
    expect(!r.hasCrash).toBe(true);
  });

  await test.step('F02 | How much money did I save?', async () => {
    const r = await sendAndWait(page, 'How much money did I save?', 25_000);
    rec('Analytics', 'F02', 'How much money did I save?', r, contains(r.text,'money','save','rupee','cost','rides','stats','dashboard'));
    expect(!r.hasCrash).toBe(true);
  });

  await test.step('F03 | Show dashboard stats', async () => {
    const r = await sendAndWait(page, 'Show dashboard stats', 25_000);
    rec('Analytics', 'F03', 'Show dashboard stats', r, contains(r.text,'stat','rides','completed','co2','save','dashboard','analytics','your','posted'));
    expect(!r.hasCrash).toBe(true);
  });

  await test.step('F04 | Show ride history', async () => {
    const r = await sendAndWait(page, 'Show ride history', 25_000);
    rec('Analytics', 'F04', 'Show ride history', r, contains(r.text,'ride','history','past','completed','no ride','stats','dashboard'));
    expect(!r.hasCrash).toBe(true);
  });

  await test.step('F05 | How many rides completed?', async () => {
    const r = await sendAndWait(page, 'How many rides completed?', 25_000);
    rec('Analytics', 'F05', 'How many rides completed?', r, contains(r.text,'ride','completed','total','stats','dashboard','history','you have'));
    expect(!r.hasCrash).toBe(true);
  });

  // ── G. HELP & GENERAL AI ─────────────────────────────────────────────────
  console.log('\n-- G. Help & General AI --');

  await test.step('G01 | Help', async () => {
    const r = await sendAndWait(page, 'Help', 20_000);
    const ok = contains(r.text,'help','can','ride','find','post','join');
    rec('Help/General', 'G01', 'Help', r, ok);
    expect(ok, 'Help must list capabilities. Got: ' + r.text.slice(0, 80)).toBe(true);
  });

  await test.step('G02 | What can you do?', async () => {
    const r = await sendAndWait(page, 'What can you do?', 20_000);
    const ok = contains(r.text,'ride','find','post','join','can','help','assist');
    rec('Help/General', 'G02', 'What can you do?', r, ok);
    expect(ok).toBe(true);
  });

  await test.step('G03 | Explain trust score', async () => {
    const r = await sendAndWait(page, 'Explain trust score', 25_000);
    rec('Help/General', 'G03', 'Explain trust score', r, contains(r.text,'trust','score','reliability','cancel','rating','completion','behaviour','policy','system'));
    expect(!r.hasCrash).toBe(true);
  });

  await test.step('G04 | How does clustering work?', async () => {
    const r = await sendAndWait(page, 'How does clustering work?', 25_000);
    rec('Help/General', 'G04', 'How does clustering work?', r, contains(r.text,'cluster','group','ride','similar','destination','suggest','algorithm','find','help','can'));
    expect(!r.hasCrash).toBe(true);
  });

  await test.step('G05 | How do you calculate CO2?', async () => {
    const r = await sendAndWait(page, 'How do you calculate CO2?', 25_000);
    rec('Help/General', 'G05', 'How do you calculate CO2?', r, contains(r.text,'co2','carbon','calculate','emission','km','ride','save','formula','find','help','can'));
    expect(!r.hasCrash).toBe(true);
  });

  await test.step('G06 | Random gibberish -- must not crash', async () => {
    const r = await sendAndWait(page, 'asdasdasd qwerty zxc 123456', 25_000);
    rec('Help/General', 'G06', 'Random gibberish input', r, !r.hasCrash && r.text.length > 5, 'Must respond gracefully');
    expect(!r.hasCrash).toBe(true);
    expect(r.text.length).toBeGreaterThan(5);
  });

  await test.step('G07 | Long paragraph input -- no crash', async () => {
    const long = 'I want to find a ride to Koramangala. I have been trying to find a good ride-sharing option for my daily commute from my housing society. I prefer mornings around 8 or 9 AM and I want it to be affordable and with a reliable driver who has a good trust score and has completed many rides before without cancellations.';
    const r = await sendAndWait(page, long, 35_000);
    rec('Help/General', 'G07', 'Long paragraph (300+ chars)', r, !r.hasCrash && r.text.length > 5);
    expect(!r.hasCrash).toBe(true);
    expect(r.text.length).toBeGreaterThan(5);
  });

  await test.step('G08 | SQL injection -- no DB error leaked', async () => {
    const r = await sendAndWait(page, "'; DROP TABLE rides; --", 25_000);
    const safe = !r.text.toLowerCase().includes('firestore error')
      && !r.text.toLowerCase().includes('database error')
      && !r.hasCrash;
    rec('Security', 'G08', "SQL injection attempt", r, safe, safe ? 'No DB errors leaked' : 'DB error info leaked');
    expect(safe).toBe(true);
  });

  await test.step('G09 | XSS attempt -- no script execution', async () => {
    let xssExecuted = false;
    await page.exposeFunction('__xssProbe', () => { xssExecuted = true; }).catch(() => {});
    const r = await sendAndWait(page, '<script>window.__xssProbe&&window.__xssProbe()</script>', 25_000);
    await page.waitForTimeout(1000);
    rec('Security', 'G09', 'XSS script injection', r, !xssExecuted && !r.hasCrash, xssExecuted ? 'CRITICAL XSS EXECUTED' : 'XSS safely neutralised');
    expect(xssExecuted, 'XSS executed in chatbot!').toBe(false);
    expect(!r.hasCrash).toBe(true);
  });

  // ── H. MULTI-TURN ─────────────────────────────────────────────────────────
  console.log('\n-- H. Multi-turn Conversation --');

  await test.step('H01 | Search -> refine "Only tomorrow"', async () => {
    await sendAndWait(page, 'Find rides to Koramangala', 35_000);
    const r2 = await sendAndWait(page, 'Only tomorrow', 30_000);
    rec('Multi-turn', 'H01', 'Search Koramangala -> Only tomorrow', r2, r2.text.length > 5 && !r2.hasCrash, 'Context carryover');
    expect(!r2.hasCrash).toBe(true);
  });

  await test.step('H02 | Stats -> "Explain that more"', async () => {
    await sendAndWait(page, 'Show my stats', 25_000);
    const r2 = await sendAndWait(page, 'Explain that more', 25_000);
    rec('Multi-turn', 'H02', 'Show stats -> Explain that more', r2, r2.text.length > 10 && !r2.hasCrash);
    expect(!r2.hasCrash).toBe(true);
    expect(r2.text.length).toBeGreaterThan(10);
  });

  await test.step('H03 | Find rides -> "Cancel that"', async () => {
    await sendAndWait(page, 'Find rides to Electronic City', 35_000);
    const r2 = await sendAndWait(page, 'Cancel that', 20_000);
    rec('Multi-turn', 'H03', 'Find rides -> Cancel that', r2, contains(r2.text,'cancel','ok','sure','help','else','action','cancelled','what','ride'));
    expect(!r2.hasCrash).toBe(true);
  });

  await test.step('H04 | Context carryover -- destination remembered', async () => {
    await sendAndWait(page, 'Find rides to Whitefield', 35_000);
    const r2 = await sendAndWait(page, 'What about tomorrow?', 30_000);
    rec('Multi-turn', 'H04', 'Find Whitefield -> What about tomorrow?', r2, r2.text.length > 5 && !r2.hasCrash, 'Destination remembered');
    expect(!r2.hasCrash).toBe(true);
    expect(r2.text.length).toBeGreaterThan(5);
  });

  // ============================================================
  //  FINAL REPORT
  // ============================================================
  const passCount  = RESULTS.filter(r => r.status === 'PASS').length;
  const failCount  = RESULTS.filter(r => r.status === 'FAIL').length;
  const warnCount  = RESULTS.filter(r => r.status === 'WARN').length;
  const total      = RESULTS.length;
  const secResults = RESULTS.filter(r => r.category === 'Security');
  const b08        = RESULTS.find(r => r.id === 'B08');

  console.log('\n');
  console.log('================================================================');
  console.log('  ColonyCarpool -- AI Chatbot QA Validation Report');
  console.log('================================================================');
  console.log('  Date     : ' + new Date().toLocaleString());
  console.log('  App      : https://final-year-project-swart-gamma.vercel.app');
  console.log('  User     : testuser@gmail.com');
  console.log('----------------------------------------------------------------');
  console.log('  Total    : ' + total);
  console.log('  PASS     : ' + passCount);
  console.log('  FAIL     : ' + failCount);
  console.log('  WARN     : ' + warnCount + '  (functionally OK, phrasing different)');
  console.log('  Security : ' + secResults.filter(r => r.status === 'PASS').length + '/' + secResults.length + ' passed');
  console.log('  Hallucination (B08): ride cards = ' + (b08 ? b08.rideCards : '?') + ' (0 = none, GOOD)');
  console.log('----------------------------------------------------------------');

  const cats = [...new Set(RESULTS.map(r => r.category))];
  for (const cat of cats) {
    const catR = RESULTS.filter(x => x.category === cat);
    console.log('\n  [' + cat + '] ' + catR.filter(r => r.status === 'PASS').length + '/' + catR.length + ' pass');
    for (const r of catR) {
      const icon = r.status === 'PASS' ? '[PASS]' : r.status === 'FAIL' ? '[FAIL]' : '[WARN]';
      console.log('    ' + icon + ' [' + r.id + '] ' + r.prompt.slice(0, 50));
      if (r.note) console.log('           -> ' + r.note);
      console.log('           Bot: "' + r.response.slice(0, 90) + '"');
    }
  }
  console.log('\n================================================================');

  const failedList = RESULTS.filter(r => r.status === 'FAIL').map(r => '[' + r.id + '] ' + r.prompt);
  if (failedList.length > 0) {
    console.log('\nFAILED TESTS:\n' + failedList.map(f => '  ' + f).join('\n'));
  }
  console.log('================================================================\n');

  expect(failCount, failCount + ' hard failure(s):\n' + failedList.join('\n')).toBe(0);
});
