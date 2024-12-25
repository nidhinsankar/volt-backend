
@json
class Thread {
  id: string = "";
  title: string = "";
  clerk_user_id: string = "";
  created_at: i64 = 0;
  last_message_at: i64 = 0;
}


@json
class Message {
  id: string = "";
  thread_id: string = "";
  role: string = "";
  content: string = "";
  created_at: i64 = 0;
  sources: string[] = [];
}

// Models for authentication
@json
class ClerkClaims {
  sub: string = "";
  exp: i64 = 0;
  iat: i64 = 0;
}

// Models for OpenAI API
@json
class FunctionCall {
  name: string = "";
  arguments: string = "";
}


@json
class ToolCall {
  id: string = "";
  type: string = "function";
  function: FunctionCall = new FunctionCall();
}


@json
class ChatMessage {
  role: string = "";
  content: string = "";
  tool_calls: ToolCall[] | null = null;
}


@json
class OpenAIChatInput {
  model: string = "";
  messages: ChatMessage[] = [];
}


@json
class OpenAIChatOutput {
  choices: Choice[] = [];
}


@json
class Choice {
  message: ChatMessage = new ChatMessage();
}


@json
class NewsSearchArgs {
  query: string = "";
  sortBy: string = "";
}


@json
class NewsApiResponse {
  articles: Article[] = [];
}


@json
class Article {
  url: string = "";
}


@json
class TitleResponse {
  title: string = "";
}

export {
  Thread,
  Message,
  ClerkClaims,
  ChatMessage,
  OpenAIChatInput,
  OpenAIChatOutput,
  Choice,
  NewsSearchArgs,
  NewsApiResponse,
  Article,
  TitleResponse,
};
