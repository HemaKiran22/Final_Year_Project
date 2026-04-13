import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatGroq } from '@langchain/groq';
import { ChatOpenAI } from '@langchain/openai';
import { Pinecone } from '@pinecone-database/pinecone';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '..');
const knowledgeBaseDir = path.resolve(projectRoot, 'ai/knowledge-base');
const readmePath = path.resolve(projectRoot, 'README.md');

let namespaceClientPromise;
let chatModelPromise;

function getRagConfig() {
  const pineconeApiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX_NAME || process.env.PINECONE_INDEX;

  if (!pineconeApiKey) {
    throw new Error('PINECONE_API_KEY must be set on the server');
  }

  if (!indexName) {
    throw new Error('PINECONE_INDEX_NAME must be set on the server');
  }

  return {
    pineconeApiKey,
    indexName,
    namespace: process.env.PINECONE_NAMESPACE || 'colonycarpool-rag',
    integratedEmbedModel: process.env.PINECONE_EMBED_MODEL || 'llama-text-embed-v2',
    integratedTextField: process.env.PINECONE_TEXT_FIELD || 'chunk_text',
    chatModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
    groqModel: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
    dimension: Number(process.env.PINECONE_INDEX_DIMENSION || 1024),
    metric: process.env.PINECONE_INDEX_METRIC || 'cosine',
    cloud: process.env.PINECONE_CLOUD || 'aws',
    region: process.env.PINECONE_REGION || 'us-east-1',
  };
}

function readMarkdownFiles(directoryPath) {
  if (!fs.existsSync(directoryPath)) return [];

  return fs.readdirSync(directoryPath)
    .filter((fileName) => fileName.toLowerCase().endsWith('.md'))
    .map((fileName) => {
      const filePath = path.resolve(directoryPath, fileName);
      return {
        filePath,
        title: fileName.replace(/\.md$/i, '').replace(/[-_]/g, ' '),
        content: fs.readFileSync(filePath, 'utf8'),
      };
    });
}

function readKnowledgeBaseSources() {
  const sources = [];

  if (fs.existsSync(readmePath)) {
    sources.push({
      filePath: readmePath,
      title: 'Frontend README',
      content: fs.readFileSync(readmePath, 'utf8'),
    });
  }

  sources.push(...readMarkdownFiles(knowledgeBaseDir));
  return sources;
}

function chunkText(text, chunkSize = 900, chunkOverlap = 140) {
  const chunks = [];
  const cleanText = String(text || '').trim();
  if (!cleanText) return chunks;
  if (cleanText.length <= chunkSize) return [cleanText];

  let start = 0;
  while (start < cleanText.length) {
    const end = Math.min(cleanText.length, start + chunkSize);
    const chunk = cleanText.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end === cleanText.length) break;
    start = Math.max(0, end - chunkOverlap);
  }

  return chunks;
}

function toIntegratedRecords(sources = readKnowledgeBaseSources()) {
  const records = [];
  const config = getRagConfig();

  for (const source of sources) {
    const chunks = chunkText(source.content);
    chunks.forEach((chunk, index) => {
      const sourcePath = path.relative(projectRoot, source.filePath).replace(/\\/g, '/');
      const safeSource = sourcePath.replace(/[^a-zA-Z0-9._/-]/g, '_');
      const id = `${safeSource}::${index}`;
      const record = {
        id,
        title: source.title,
        source: sourcePath,
        chunkIndex: index,
      };

      record[config.integratedTextField] = chunk;
      records.push(record);
    });
  }

  return records;
}

function getLatestUserQuestion(messages) {
  const reversed = [...messages].reverse();
  const latestUserMessage = reversed.find((message) => message.role === 'user');
  return String(latestUserMessage?.content || '').trim();
}

function getConversationHistory(messages) {
  return messages
    .slice(-8)
    .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${String(message.content || '')}`)
    .join('\n');
}

function createPineconeClient() {
  const { pineconeApiKey } = getRagConfig();
  return new Pinecone({ apiKey: pineconeApiKey });
}

async function ensurePineconeIndex({ createIfMissing = false } = {}) {
  const config = getRagConfig();
  const pinecone = createPineconeClient();
  const indexList = await pinecone.listIndexes();
  const existingIndex = indexList.indexes?.find((index) => index.name === config.indexName);

  if (!existingIndex) {
    if (!createIfMissing) {
      throw new Error(`Pinecone index "${config.indexName}" does not exist. Run npm run rag:bootstrap after setting PINECONE_CLOUD and PINECONE_REGION.`);
    }

    await pinecone.createIndexForModel({
      name: config.indexName,
      cloud: config.cloud,
      region: config.region,
      embed: {
        model: config.integratedEmbedModel,
        metric: config.metric,
        fieldMap: { text: config.integratedTextField },
      },
      suppressConflicts: true,
      waitUntilReady: true,
    });
  } else if (existingIndex.metric && existingIndex.metric !== config.metric) {
    throw new Error(`Pinecone index "${config.indexName}" uses metric ${existingIndex.metric}, but this chatbot expects ${config.metric}.`);
  }

  return { pinecone, config };
}

async function loadNamespaceClient({ createIndexIfMissing = false } = {}) {
  const { pinecone, config } = await ensurePineconeIndex({ createIfMissing: createIndexIfMissing });
  return pinecone.Index(config.indexName).namespace(config.namespace);
}

async function resolveChatModel() {
  if (process.env.GROQ_API_KEY) {
    return new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: getRagConfig().groqModel,
      temperature: 0.2,
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY or GROQ_API_KEY must be set on the server');
  }

  return new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    model: getRagConfig().chatModel,
    temperature: 0.2,
  });
}

async function getChatModel() {
  if (!chatModelPromise) {
    chatModelPromise = resolveChatModel();
  }

  return chatModelPromise;
}

async function getNamespaceClient() {
  if (!namespaceClientPromise) {
    namespaceClientPromise = loadNamespaceClient({ createIndexIfMissing: false });
  }

  return namespaceClientPromise;
}

export async function bootstrapRagIndex() {
  const config = getRagConfig();
  const namespace = await loadNamespaceClient({ createIndexIfMissing: true });
  const records = toIntegratedRecords();

  if (records.length) {
    await namespace.upsertRecords(records);
  }

  return {
    indexName: config.indexName,
    namespace: config.namespace,
    documentCount: records.length,
  };
}

export async function answerQuestion(question, messages) {
  const config = getRagConfig();
  const namespace = await getNamespaceClient();
  const response = await namespace.searchRecords({
    query: {
      topK: 4,
      inputs: { text: question },
    },
    fields: ['title', 'source', 'chunkIndex', config.integratedTextField],
  });

  const hits = Array.isArray(response?.result?.hits) ? response.result.hits : [];

  const sources = hits.map((hit) => {
    const fields = (hit && typeof hit.fields === 'object' && hit.fields) || {};
    return {
      title: String(fields.title || 'Knowledge source'),
      source: String(fields.source || ''),
      excerpt: String(fields[config.integratedTextField] || '').replace(/\s+/g, ' ').slice(0, 240),
    };
  });

  const context = hits.length
    ? hits.map((hit, index) => {
      const fields = (hit && typeof hit.fields === 'object' && hit.fields) || {};
      return (
        `Source ${index + 1}: ${String(fields.title || 'Knowledge source')}\n`
        + `Path: ${String(fields.source || '')}\n`
        + `Content:\n${String(fields[config.integratedTextField] || '')}`
      );
    }).join('\n\n---\n\n')
    : 'No relevant source was retrieved.';

  const history = getConversationHistory(messages);
  const model = await getChatModel();

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', [
      'You are the ColonyCarpool chatbot.',
      'Answer only from the provided knowledge base and recent conversation.',
      'If the answer is not in the knowledge base, say so and ask one short clarifying question.',
      'Do not claim to access private user records or perform ride actions from chat.',
      'Be concise and helpful.',
    ].join(' ')],
    ['human', 'Conversation:\n{history}\n\nQuestion:\n{question}\n\nRelevant knowledge base:\n{context}'],
  ]);

  const chain = prompt.pipe(model).pipe(new StringOutputParser());
  const answer = await chain.invoke({ question, context, history });

  return {
    answer: String(answer || '').trim(),
    sources,
  };
}

export function getLatestChatQuestion(messages) {
  return getLatestUserQuestion(messages);
}
