import { dgraph } from "@hypermode/modus-sdk-as";
import { JSON } from "json-as";
import { Message, Conversation } from "./classes";
import { embedText } from "./embeddings";
import {
  buildMessageMutationJson,
  buildConversationMutationJson,
} from "./chat-helpers";
import {
  ListOf,
  searchBySimilarity,
  getEntityById,
  addEmbeddingToJson,
} from "./dgraph-utils";

const DGRAPH_CONNECTION = "dgraph-grpc";

export function createConversation(title: string): string {
  const conversation = new Conversation();
  conversation.id = generateUuid();
  conversation.title = title;
  conversation.created = new Date(Date.now()).toISOString();
  conversation.lastUpdated = conversation.created;

  const payload = buildConversationMutationJson(
    DGRAPH_CONNECTION,
    conversation,
  );
  const mutations = [new dgraph.Mutation(payload)];
  const uids = dgraph.execute(
    DGRAPH_CONNECTION,
    new dgraph.Request(null, mutations),
  ).Uids;

  return conversation.id;
}

export function sendMessage(
  content: string,
  sender: string,
  conversationId: string,
): void {
  const message = new Message();
  message.id = generateUuid();
  message.content = content;
  message.timestamp = new Date(Date.now()).toISOString();
  message.sender = sender;
  message.conversationId = conversationId;

  var payload = buildMessageMutationJson(DGRAPH_CONNECTION, message);

  // Create embedding for semantic search
  const embedding = embedText([content])[0];
  payload = addEmbeddingToJson(payload, "Message.embedding", embedding);

  const mutations = [new dgraph.Mutation(payload)];
  dgraph.execute(DGRAPH_CONNECTION, new dgraph.Request(null, mutations));

  // Update conversation lastUpdated
  updateConversationTimestamp(conversationId);
}

export function getConversationHistory(conversationId: string): Message[] {
  const query = new dgraph.Query(`{
        list(func: eq(Message.conversationId, "${conversationId}")) {
            Message.id
            Message.content
            Message.timestamp
            Message.sender
            Message.conversationId
        }
    }`);

  const response = dgraph.execute(DGRAPH_CONNECTION, new dgraph.Request(query));
  const data = JSON.parse<ListOf<Message>>(response.Json);
  return data.list;
}

export function searchMessages(query: string, topK: i32 = 5): Message[] {
  const embedding = embedText([query])[0];

  const body = `
        Message.id
        Message.content
        Message.timestamp
        Message.sender
        Message.conversationId
    `;

  return searchBySimilarity<Message>(
    DGRAPH_CONNECTION,
    embedding,
    "Message.embedding",
    body,
    topK,
  );
}

function updateConversationTimestamp(conversationId: string): void {
  const timestamp = new Date(Date.now()).toISOString();
  const mutation = new dgraph.Mutation(`{
        "uid": "_:temp",
        "Conversation.id": "${conversationId}",
        "Conversation.lastUpdated": "${timestamp}"
    }`);

  dgraph.execute(DGRAPH_CONNECTION, new dgraph.Request(null, [mutation]));
}

function generateUuid(): string {
  // Simple UUID generation for demo purposes
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
// import { JSON } from "json-as";
// import { dgraph } from "@hypermode/modus-sdk-as";
// import { Content } from "./classes";
// import { embedText } from "./embeddings";
// import { buildContentMutationJson } from "./content-helpers";
// import {
//   deleteNodePredicates,
//   ListOf,
//   searchBySimilarity,
//   getEntityById,
//   addEmbeddingToJson,
//   getAllContents,
//   searchByTags,
// } from "./dgraph-utils";

// const DGRAPH_CONNECTION = "dgraph-grpc";

// export function addContent(content: Content): Map<string, string> | null {
//   var payload = buildContentMutationJson(DGRAPH_CONNECTION, content);

//   const embedding = embedText([content.title])[0];
//   payload = addEmbeddingToJson(payload, "Content.embedding", embedding);

//   const mutations: dgraph.Mutation[] = [new dgraph.Mutation(payload)];
//   const uids = dgraph.execute(
//     DGRAPH_CONNECTION,
//     new dgraph.Request(null, mutations),
//   ).Uids;

//   return uids;
// }

// export function getContent(id: string): Content | null {
//   const body = `
//     Content.id
//     Content.title
//     Content.url
//     Content.type`;
//   return getEntityById<Content>(DGRAPH_CONNECTION, "Content.id", id, body);
// }

// export function deleteContent(id: string): void {
//   deleteNodePredicates(DGRAPH_CONNECTION, `eq(Content.id, "${id}")`, [
//     "Content.id",
//     "Content.title",
//     "Content.url",
//     "Content.type",
//   ]);
// }

// export function searchContent(
//   query: string,
//   contentType: string = "",
// ): Content[] {
//   const embedding = embedText([query])[0];
//   const topK = 10;

//   let typeFilter = "";
//   if (contentType != "") {
//     typeFilter = ` @filter(eq(Content.type, "${contentType}"))`;
//   }

//   const body = `
//     Content.id
//     Content.title
//     Content.url
//     Content.type
//   `;
//   return searchBySimilarity<Content>(
//     DGRAPH_CONNECTION,
//     embedding,
//     "Content.embedding",
//     body,
//     topK,
//   );
// }

// export function getContentByType(type: string): Content[] {
//   const query = new dgraph.Query(`{
//     list(func: eq(Content.type, "${type}")) {
//       Content.id
//       Content.title
//       Content.url
//       Content.type
//     }
//   }`);

//   const response = dgraph.execute(DGRAPH_CONNECTION, new dgraph.Request(query));
//   const data = JSON.parse<ListOf<Content>>(response.Json);
//   return data.list;
// }

// export function getAllContent(): Content[] {
//   const body = `
//     Content.id
//     Content.title
//     Content.url
//     Content.type
//     Content.tags`;
//   return getAllContents<Content>(DGRAPH_CONNECTION, body);
// }

// export function getAllTags(): string[] {
//   const query = new dgraph.Query(`{
//     list(func: type(Content)) @filter(has(Content.tags)) {
//       Content.tags
//     }
//   }`);

//   const response = dgraph.execute(DGRAPH_CONNECTION, new dgraph.Request(query));
//   const data = JSON.parse<ListOf<Content>>(response.Json);

//   // Create a unique set of tags
//   const uniqueTags = new Set<string>();
//   for (let i = 0; i < data.list.length; i++) {
//     const content = data.list[i];
//     if (content.tags) {
//       for (let j = 0; j < content.tags.length; j++) {
//         uniqueTags.add(content.tags[j]);
//       }
//     }
//   }

//   // Convert set to array
//   const tags: string[] = [];
//   const values = uniqueTags.values();
//   for (let i = 0; i < uniqueTags.size; i++) {
//     tags.push(values[i]);
//   }
//   return tags;
// }

// export function getContentByTags(tags: string[]): Content[] {
//   const body = `
//     Content.id
//     Content.title
//     Content.url
//     Content.type
//     Content.tags`;
//   return searchByTags<Content>(DGRAPH_CONNECTION, tags, body);
// }

// export function getContentByTag(tag: string): Content[] {
//   const query = new dgraph.Query(`{
//     list(func: type(Content)) @filter(has(Content.tags) AND anyofterms(Content.tags, "${tag}")) {
//       Content.id
//       Content.title
//       Content.url
//       Content.type
//       Content.tags
//       Content.embedding
//     }
//   }`);

//   const response = dgraph.execute(DGRAPH_CONNECTION, new dgraph.Request(query));
//   const data = JSON.parse<ListOf<Content>>(response.Json);
//   return data.list;
// }

// // export * from "./models";
// // export * from "./generateText";
// // export {
// //   createThread,
// //   deleteThread,
// //   getAllThreads,
// //   getCurrentUserId,
// //   getReply,
// //   getThreadById,
// //   getThreadMessages,
// // } from "./chat";
// // export function sayHello(name: string | null = null): string {
// //   return `Hello, ${name || "World"}!`;
// // }
