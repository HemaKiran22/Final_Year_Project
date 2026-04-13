const BASE_URL = process.env.CHATBOT_TEST_URL || 'https://final-year-project-swart-gamma.vercel.app';
const ENDPOINT = `${BASE_URL.replace(/\/$/, '')}/api/chat`;

const CASES = [
  'What is ColonyCarpool?',
  'What can this chatbot help with?',
  'How do I post a ride?',
  'How do I find a ride?',
  'How do I join a ride?',
  'How do I cancel a ride?',
  'How does trust score work?',
  'How is reliability measured?',
  'How do ratings work?',
  'How does clustering work in this app?',
  'How does CO2 savings work?',
  'How does money savings get calculated?',
  'Can chatbot book rides directly for me?',
  'Can chatbot access my private records?',
  'What should I do if no rides are found?',
  'What is leaderboard used for?',
  'What is society feed used for?',
  'What is help and support section?',
  'How do private chats work?',
  'How do group chats work?',
  'What are safe ride practices?',
  'What is the purpose of ride rules?',
  'What should I do if I am running late?',
  'Can I leave a ride after joining?',
  'How do I complete a ride?',
  'How do I improve trust score?',
  'What happens when I cancel frequently?',
  'How do I report an issue?',
  'Give me quick summary of app features.',
  'Explain the RAG chatbot in this project.',
  'Does chatbot answer only from knowledge base?',
  'If answer is not in KB, what should bot do?',
  'What environment does this project use for API chat?',
  'How do I bootstrap the chatbot index?',
  'What is Pinecone namespace used here?',
  'Tell me about integrated embeddings setup.',
  'What are limitations of the chatbot?',
  'asdasdasd qwerty 12345',
  '<script>alert(1)</script>',
  "'; DROP TABLE rides; --",
];

function buildPayload(question) {
  return {
    messages: [
      { role: 'user', content: question },
    ],
  };
}

function hasHardError(answer) {
  const text = String(answer || '').toLowerCase();
  return [
    'typeerror',
    'referenceerror',
    'syntaxerror',
    'cannot read',
    'undefined is not',
    'internal server error',
  ].some((token) => text.includes(token));
}

async function runCase(id, question) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const started = Date.now();

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(question)),
      signal: controller.signal,
    });

    const elapsedMs = Date.now() - started;
    let data = null;
    const rawText = await response.text();
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = null;
    }

    const answer = String(data?.answer || rawText || '').trim();
    const sources = Array.isArray(data?.sources) ? data.sources : [];

    const pass = response.ok
      && answer.length >= 10
      && !hasHardError(answer);

    return {
      id,
      question,
      status: pass ? 'PASS' : 'FAIL',
      httpStatus: response.status,
      elapsedMs,
      answerPreview: answer.slice(0, 180),
      sourcesCount: sources.length,
      failureReason: pass
        ? ''
        : (!response.ok
          ? `HTTP ${response.status}`
          : (answer.length < 10 ? 'Answer too short' : 'Hard error text detected')),
    };
  } catch (error) {
    return {
      id,
      question,
      status: 'FAIL',
      httpStatus: 0,
      elapsedMs: Date.now() - started,
      answerPreview: '',
      sourcesCount: 0,
      failureReason: String(error?.message || error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  console.log(`Running ${CASES.length} chatbot test cases against: ${ENDPOINT}`);
  const results = [];

  for (let i = 0; i < CASES.length; i += 1) {
    const id = `TC-${String(i + 1).padStart(2, '0')}`;
    const result = await runCase(id, CASES[i]);
    results.push(result);
    console.log(`[${result.status}] ${id} (${result.httpStatus || 'ERR'}) ${result.elapsedMs}ms :: ${result.question}`);
    if (result.status === 'FAIL') {
      console.log(`  -> ${result.failureReason}`);
    }
  }

  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.length - passCount;
  const avgMs = Math.round(results.reduce((sum, r) => sum + r.elapsedMs, 0) / results.length);

  console.log('\n=== Chatbot 40-Case Report ===');
  console.log(`Total: ${results.length}`);
  console.log(`Pass : ${passCount}`);
  console.log(`Fail : ${failCount}`);
  console.log(`Avg latency: ${avgMs} ms`);

  if (failCount > 0) {
    console.log('\nFailed Cases:');
    for (const failed of results.filter((r) => r.status === 'FAIL')) {
      console.log(`- ${failed.id}: ${failed.question}`);
      console.log(`  Reason: ${failed.failureReason}`);
      console.log(`  Preview: ${failed.answerPreview}`);
    }
  }

  process.exitCode = failCount > 0 ? 1 : 0;
}

main();
