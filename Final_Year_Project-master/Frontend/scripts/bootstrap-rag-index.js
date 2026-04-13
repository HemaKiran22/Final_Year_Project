import fs from 'node:fs';
import path from 'node:path';
import { bootstrapRagIndex } from '../server/rag.js';

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) continue;

    const key = line.slice(0, equalsIndex).trim();
    if (!key || (process.env[key] && String(process.env[key]).trim() !== '')) continue;

    let value = line.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

async function main() {
  try {
    loadDotEnv();
    const result = await bootstrapRagIndex();
    console.log(`Pinecone index ready: ${result.indexName}`);
    console.log(`Namespace: ${result.namespace}`);
    console.log(`Documents indexed: ${result.documentCount}`);
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
}

main();
