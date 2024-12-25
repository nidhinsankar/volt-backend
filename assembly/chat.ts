import { auth, http, postgresql } from "@hypermode/modus-sdk-as";
import { JSON } from "json-as";
import { Content } from "@hypermode/modus-sdk-as/assembly/http";
import { Thread, Message, ClerkClaims } from "./models";
import { bytesToUUID } from "./utils";
import {
  classifyMessage,
  searchNews,
  createFocusedSummary,
  NewsArticle,
  NewsAPIResponse,
  OpenAIChatInput,
  OpenAIMessage,
  OpenAIResponse,
  ChatMessage,
} from "./functions";
import { TitleResponse } from "./models";
const dbName = "db";

// Function to get the current authenticated user's ID
export function getCurrentUserId(): string {
  const claims = auth.getJWTClaims<ClerkClaims>();
  if (!claims || !claims.sub) {
    throw new Error("User not authenticated");
  }
  return claims.sub;
}

// Function to create a new thread
export function createThread(firstMessage: string): Thread {
  const userId = getCurrentUserId();

  // First, get a title for the thread using LLM
  const titlePrompt = `Based on this first message, generate a short, concise title (max 5 words): "${firstMessage}"
  Your response should be a JSON object with a single key "title" and the value as the title string.
  `;

  const request = new http.Request(
    "https://api.openai.com/v1/chat/completions",
  );
  request.headers.append("Content-Type", "application/json");

  const body = new OpenAIChatInput();
  const systemMsg = new OpenAIMessage();
  systemMsg.role = "system";
  systemMsg.content = titlePrompt;

  const userMsg = new OpenAIMessage();
  userMsg.role = "user";
  userMsg.content = firstMessage;

  body.messages = [systemMsg, userMsg];

  const options = new http.RequestOptions();
  options.method = "POST";
  options.body = Content.from(JSON.stringify(body));

  console.log(`Request body: ${JSON.stringify(body)}`);
  const response = http.fetch(request, options);
  if (response.status !== 200) {
    throw new Error(
      `OpenAI API error: ${response.status.toString()} ${response.statusText}`,
    );
  }

  const responseJson = JSON.parse<OpenAIResponse>(response.text());
  const title = JSON.parse<TitleResponse>(
    responseJson.choices[0].message.content,
  ).title;
  console.log(`Title: ${title}`);

  // Create thread in database
  const now = Date.now();
  const threadQuery = `
    INSERT INTO threads (title, clerk_user_id, created_at, last_message_at)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;

  const threadParams = new postgresql.Params();
  threadParams.push(title);
  threadParams.push(userId);
  threadParams.push(now);
  threadParams.push(now);

  const threadResponse = postgresql.query<Thread>(
    dbName,
    threadQuery,
    threadParams,
  );
  const thread = threadResponse.rows[0];
  thread.id = bytesToUUID(thread.id);

  console.log(`Thread created: ${thread.id}`);

  return thread;
}

// Function to get all threads for current user
export function getAllThreads(): Thread[] {
  const userId = getCurrentUserId();

  const query = `
    SELECT * FROM threads 
    WHERE clerk_user_id = $1 
    ORDER BY last_message_at DESC
  `;

  const params = new postgresql.Params();
  params.push(userId);

  const response = postgresql.query<Thread>(dbName, query, params);
  const threads: Thread[] = [];
  for (let i = 0; i < response.rows.length; i++) {
    const thread = response.rows[i];
    thread.id = bytesToUUID(thread.id);
    threads.push(thread);
  }
  return threads;
}

// Function to get a specific thread by ID
export function getThreadById(threadId: string): Thread {
  const userId = getCurrentUserId();

  const query = `
    SELECT * FROM threads 
    WHERE id = $1 AND clerk_user_id = $2
  `;

  const params = new postgresql.Params();
  params.push(threadId);
  params.push(userId);

  const response = postgresql.query<Thread>(dbName, query, params);
  if (response.rows.length === 0) {
    throw new Error("Thread not found or access denied");
  }
  const thread = response.rows[0];
  thread.id = bytesToUUID(thread.id);
  return thread;
}

// Function to delete a thread
export function deleteThread(threadId: string): void {
  const userId = getCurrentUserId();

  // First verify ownership
  getThreadById(threadId);

  // Delete messages first (due to foreign key constraint)
  const deleteMessagesQuery = `
    DELETE FROM messages WHERE thread_id = $1
  `;

  const messageParams = new postgresql.Params();
  messageParams.push(threadId);
  postgresql.query<Message>(dbName, deleteMessagesQuery, messageParams);

  // Then delete thread
  const deleteThreadQuery = `
    DELETE FROM threads WHERE id = $1 AND clerk_user_id = $2
  `;

  const threadParams = new postgresql.Params();
  threadParams.push(threadId);
  threadParams.push(userId);
  postgresql.query<Thread>(dbName, deleteThreadQuery, threadParams);
}

// Function to get messages for a thread
export function getThreadMessages(threadId: string): Message[] {
  // Verify thread ownership
  getThreadById(threadId);

  const query = `
    SELECT * FROM messages 
    WHERE thread_id = $1 
    ORDER BY created_at ASC
  `;

  const params = new postgresql.Params();
  params.push(threadId);

  const response = postgresql.query<Message>(dbName, query, params);
  const messages: Message[] = [];
  for (let i = 0; i < response.rows.length; i++) {
    const msg = response.rows[i];
    msg.id = bytesToUUID(msg.id);
    msg.thread_id = bytesToUUID(msg.thread_id);
    messages.push(msg);
  }
  return messages;
}

// Function to get a reply from LLM and save it
export function getReply(threadId: string, userMessage: string): Message {
  console.log(`User message: ${userMessage}`);

  // Insert user message into database
  let now = Date.now();
  const userMessageQuery = `
    INSERT INTO messages (thread_id, role, content, created_at)
    VALUES ($1, $2, $3, $4)
  `;
  const userMessageParams = new postgresql.Params();
  userMessageParams.push(threadId);
  userMessageParams.push("user");
  userMessageParams.push(userMessage);
  userMessageParams.push(now);
  postgresql.query<Message>(dbName, userMessageQuery, userMessageParams);

  // Get thread history for context
  const messages = getThreadMessages(threadId);

  // Convert the last 3 messages to ChatMessage format
  const recentMessages: ChatMessage[] = [];
  const startIdx = Math.max(0, messages.length - 3);
  for (let i = startIdx; i < messages.length; i++) {
    recentMessages.push({
      role: messages[i].role,
      content: messages[i].content,
    });
  }

  // Classify the message using recent context
  const classification = classifyMessage(JSON.stringify(recentMessages));

  let content: string = "";
  let sources: string[] = [];

  console.log(`Classification: ${JSON.stringify(classification)}`);

  if (classification.type === "expects_general_reply") {
    content = classification.reply;
  } else if (classification.type === "expects_to_search_news") {
    const newsData = searchNews(
      classification.searchParams.query,
      classification.searchParams.sortBy,
    );
    console.log(`News data: ${JSON.stringify(newsData)}`);

    // Extract unique URLs from articles using a Set
    const uniqueSources = new Set<string>();
    const articles = newsData.articles;
    for (let i = 0; i < articles.length; i++) {
      uniqueSources.add(articles[i].url);
    }
    sources = uniqueSources.values();

    // Create focused summary using recent messages context
    content = createFocusedSummary(articles, recentMessages);
  }

  // Save bot reply with sources
  now = Date.now();
  const botMessageQuery = `
    INSERT INTO messages (thread_id, role, content, created_at, sources)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;

  const botMessageParams = new postgresql.Params();
  botMessageParams.push(threadId);
  botMessageParams.push("assistant");
  botMessageParams.push(content);
  botMessageParams.push(now);
  botMessageParams.push(sources);

  const botMessageResponse = postgresql.query<Message>(
    dbName,
    botMessageQuery,
    botMessageParams,
  );
  const botMessage = botMessageResponse.rows[0];
  botMessage.id = bytesToUUID(botMessage.id);
  botMessage.thread_id = bytesToUUID(botMessage.thread_id);

  // Update thread's last_message_at
  const updateThreadQuery = `
    UPDATE threads 
    SET last_message_at = $1 
    WHERE id = $2
  `;
  const updateThreadParams = new postgresql.Params();
  updateThreadParams.push(now);
  updateThreadParams.push(threadId);
  postgresql.query(dbName, updateThreadQuery, updateThreadParams);

  return botMessage;
}
