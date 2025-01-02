
@json
export class Message {

  @alias("Message.id")
  id!: string;


  @alias("Message.content")
  content!: string;


  @alias("Message.timestamp")
  timestamp!: string;


  @alias("Message.sender")
  sender!: string;


  @alias("Message.conversationId")
  conversationId!: string;
}


@json
export class Conversation {

  @alias("Conversation.id")
  id!: string;


  @alias("Conversation.title")
  title!: string;


  @alias("Conversation.created")
  created!: string;


  @alias("Conversation.lastUpdated")
  lastUpdated!: string;
}
