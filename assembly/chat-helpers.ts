// chat-helpers.ts
import { JSON } from "json-as";
import { Message, Conversation } from "./classes";
import { injectNodeUid } from "./dgraph-utils";
import { createChatSchema } from "./schema-helpers";

const chatSchema = createChatSchema();

export function buildMessageMutationJson(
  connection: string,
  message: Message,
): string {
  const payload = JSON.stringify(message);
  return injectNodeUid(connection, payload, "Message", chatSchema);
}

export function buildConversationMutationJson(
  connection: string,
  conversation: Conversation,
): string {
  const payload = JSON.stringify(conversation);
  return injectNodeUid(connection, payload, "Conversation", chatSchema);
}
