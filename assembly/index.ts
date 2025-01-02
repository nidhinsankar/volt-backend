// import { dgraph } from "@hypermode/modus-sdk-as";
// import { JSON } from "json-as";
// import { Message, Conversation } from "./classes";
// import { embedText } from "./embeddings";

// const DGRAPH_CONNECTION = "dgraph-grpc";

// const schema = `
//   Conversation.id: string @id .
//   Conversation.title: string .
//   Conversation.created: datetime .
//   Conversation.lastUpdated: datetime .
//   Message.id: string @id .
//   Message.content: string .
//   Message.timestamp: datetime .
//   Message.sender: string .
//   Message.conversationId: string @index(exact) .
//   Message.embedding: [float] @index(vector) .
// `;

// export function initializeSchema(): void {
//   const schemaMutation = new dgraph.Mutation(schema);
//   dgraph.execute(DGRAPH_CONNECTION, new dgraph.Request(null, [schemaMutation]));
// }

// export function createConversation(title: string): string {
//   const conversation = new Conversation();
//   conversation.id = generateUuid();
//   conversation.title = title;
//   conversation.created = new Date(Date.now()).toISOString();
//   conversation.lastUpdated = conversation.created;

//   const mutationJson = JSON.stringify({
//     set: [
//       {
//         uid: "_:conv",
//         "dgraph.type": "Conversation",
//         "Conversation.id": conversation.id,
//         "Conversation.title": conversation.title,
//         "Conversation.created": conversation.created,
//         "Conversation.lastUpdated": conversation.lastUpdated,
//       },
//     ],
//   });

//   const mutation = new dgraph.Mutation(mutationJson);
//   dgraph.execute(DGRAPH_CONNECTION, new dgraph.Request(null, [mutation]));
//   return conversation.id;
// }

// export function sendMessage(
//   content: string,
//   sender: string,
//   conversationId: string,
// ): void {
//   const message = new Message();
//   message.id = generateUuid();
//   message.content = content;
//   message.timestamp = new Date(Date.now()).toISOString();
//   message.sender = sender;
//   message.conversationId = conversationId;

//   const embedding = embedText([content])[0];
//   const mutationJson = JSON.stringify({
//     set: [
//       {
//         uid: "_:msg",
//         "dgraph.type": "Message",
//         "Message.id": message.id,
//         "Message.content": message.content,
//         "Message.timestamp": message.timestamp,
//         "Message.sender": message.sender,
//         "Message.conversationId": message.conversationId,
//         "Message.embedding": embedding,
//       },
//     ],
//   });

//   const mutation = new dgraph.Mutation(mutationJson);
//   dgraph.execute(DGRAPH_CONNECTION, new dgraph.Request(null, [mutation]));
//   updateConversationTimestamp(conversationId);
// }

// export function getConversationHistory(conversationId: string): Message[] {
//   const query = `{
//     list(func: type(Message)) @filter(eq(Message.conversationId, "${conversationId}")) {
//       Message.id
//       Message.content
//       Message.timestamp
//       Message.sender
//       Message.conversationId
//     }
//   }`;

//   const queryString = new dgraph.Query(query);
//   const response = dgraph.execute(
//     DGRAPH_CONNECTION,
//     new dgraph.Request(queryString),
//   );
//   const data = JSON.parse<ListOf<Message>>(response.Json);
//   return data.list;
// }

// export function searchMessages(query: string, topK: i32 = 5): Message[] {
//   const embedding = embedText([query])[0];
//   const queryStr = `{
//     list(func: type(Message), first: ${topK}) @filter(near(Message.embedding, ${JSON.stringify(embedding)})) {
//       Message.id
//       Message.content
//       Message.timestamp
//       Message.sender
//       Message.conversationId
//     }
//   }`;

//   const queryString = new dgraph.Query(queryStr);
//   const response = dgraph.execute(
//     DGRAPH_CONNECTION,
//     new dgraph.Request(queryString),
//   );
//   const data = JSON.parse<ListOf<Message>>(response.Json);
//   return data.list;
// }

// function updateConversationTimestamp(conversationId: string): void {
//   const timestamp = new Date(Date.now()).toISOString();
//   const mutationJson = JSON.stringify({
//     set: [
//       {
//         uid: "_:conv",
//         "dgraph.type": "Conversation",
//         "Conversation.id": conversationId,
//         "Conversation.lastUpdated": timestamp,
//       },
//     ],
//   });

//   const mutation = new dgraph.Mutation(mutationJson);
//   dgraph.execute(DGRAPH_CONNECTION, new dgraph.Request(null, [mutation]));
// }

// function generateUuid(): string {
//   return Date.now().toString(36) + Math.random().toString(36).substr(2);
// }

// interface ListOf<T> {
//   list: T[];
// }
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

export function addSchemaToDatabase(): string {
  const newSchema = `
type Message {
  Message.id: string @index(exact)
  Message.content: string @index(term)
  Message.timestamp: DateTime @search(by: [hour])
  Message.sender: string @index(term)
  Message.conversationId: string @index(term)
  Message.embedding: float32vector @index(hnsw(metric:"cosine"))
}

type Conversation {
  Conversation.id: string @index(exact)
  Conversation.title: string @index(exact)
  Conversation.created: DateTime @index(exact)
  Conversation.lastUpdated: DateTime @search(by: [hour])
}
`;
  // Call the alterSchema function from the Dgraph API
  const response = dgraph.alterSchema(DGRAPH_CONNECTION, newSchema);
  console.log(response);
  return response;
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
// import { Conversation,Message } from "./classes";
// import { embedText } from "./embeddings";
// import { buildMessageMutationJson,buildConversationMutationJson } from "./chat-helpers";
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
//    return data.list;
//  }

// export * from "./models";
// export * from "./generateText";
// export {
//   createThread,
//   deleteThread,
//   getAllThreads,
//   getCurrentUserId,
//   getReply,
//   getThreadById,
//   getThreadMessages,
// } from "./chat";
// export function sayHello(name: string | null = null): string {
//   return `Hello, ${name || "World"}!`;
// }
