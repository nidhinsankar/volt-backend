// schema-helpers.ts
import { GraphSchema, NodeType, Relationship } from "./dgraph-utils";

export function createChatSchema(): GraphSchema {
  const schema = new GraphSchema();

  // Message schema
  const messageType = new NodeType();
  messageType.id_field = "Message.id";
  messageType.relationships = [
    {
      predicate: "conversation",
      type: "Conversation",
    },
  ];

  // Conversation schema
  const conversationType = new NodeType();
  conversationType.id_field = "Conversation.id";
  conversationType.relationships = [];

  schema.node_types.set("Message", messageType);
  schema.node_types.set("Conversation", conversationType);

  return schema;
}
