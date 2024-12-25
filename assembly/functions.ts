import { http } from "@hypermode/modus-sdk-as";
import { Content } from "@hypermode/modus-sdk-as/assembly/http";
import { JSON } from "json-as";


@json
export class NewsSource {
  id: string = "";
  name: string = "";
}


@json
export class NewsArticle {
  url: string = "";
  title: string = "";
  description: string = "";
  content: string = "";
  publishedAt: string = "";
  source: NewsSource = new NewsSource();
}


@json
export class NewsAPIResponse {
  status: string = "";
  totalResults: i32 = 0;
  articles: NewsArticle[] = [];
}


@json
export class NewsSearchParams {
  query: string = "";
  sortBy: string = "relevancy";
}


@json
export class MessageClassification {
  type: string = "";
  reply: string = "";
  searchParams: NewsSearchParams = new NewsSearchParams();
}


@json
export class OpenAIMessage {
  role: string = "";
  content: string = "";
}


@json
export class OpenAIResponseFormat {
  type: string = "json_object";
}


@json
export class OpenAIChatInput {
  model: string = "gpt-4o-mini";
  messages: OpenAIMessage[] = [];
  response_format: OpenAIResponseFormat = new OpenAIResponseFormat();
}


@json
export class OpenAIChoice {
  message: OpenAIMessage = new OpenAIMessage();
}


@json
export class OpenAIResponse {
  choices: OpenAIChoice[] = [];
}


@json
export class SummaryResponse {
  summary: string = "";
}


@json
export class ChatMessage {
  role: string = "";
  content: string = "";
}


@json
export class FocusedSummaryResponse {
  answer: string = "";
}

const CLASSIFICATION_SYSTEM_PROMPT = `
For context: Today's date is ${new Date(Date.now()).toDateString()}.

You are a message classifier that determines if a user's message requires news search or a general response.
You will be provided with the recent chat history. Focus on the user's latest message to determine their intent.

Classify the conversation based on the latest message into one of two types:
1. expects_general_reply - when the latest message just needs a conversational response
2. expects_to_search_news - when the latest message is asking about news or current events

Response must be a JSON object with this structure:
{
  "type": "expects_general_reply" | "expects_to_search_news",
  "reply": string (only if type is expects_general_reply),
  "searchParams": {
    "query": string (should just be keywords, not a full sentence, as few words as possible),
    "sortBy": "relevancy" | "popularity" | "publishedAt"
  } (only if type is expects_to_search_news)
}`;

const FOCUSED_SUMMARY_SYSTEM_PROMPT = `You are an AI assistant that reads multiple news articles and provides relevant information to users.
Given a collection of news articles and the recent conversation history:
1. Read through all provided articles carefully
2. Identify key information relevant to the user's question/interest
3. Formulate a clear, direct response using facts from the articles
4. Always cite your sources when stating specific information
5. Keep responses focused and concise

Your response must be a JSON object with this structure:
{
  "answer": "your response here"
}

Remember to:
- Only use information found in the provided articles
- Address the user's specific question/interest
- Include source citations for facts
- Be objective and factual`;

export function classifyMessage(message: string): MessageClassification {
  const request = new http.Request(
    "https://api.openai.com/v1/chat/completions",
  );
  request.headers.append("Content-Type", "application/json");

  const messages: OpenAIMessage[] = [
    { role: "system", content: CLASSIFICATION_SYSTEM_PROMPT },
    { role: "user", content: message },
  ];

  const requestBody = new OpenAIChatInput();
  requestBody.messages = messages;

  const options = new http.RequestOptions();
  options.method = "POST";
  options.body = Content.from(JSON.stringify(requestBody));

  const response = http.fetch(request, options);
  if (response.status !== 200) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const openAIResponse = JSON.parse<OpenAIResponse>(response.text());
  return JSON.parse<MessageClassification>(
    openAIResponse.choices[0].message.content,
  );
}

export function searchNews(query: string, sortBy: string): NewsAPIResponse {
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=${sortBy}&pageSize=6`;
  const request = new http.Request(url);
  const response = http.fetch(request);

  if (response.status !== 200) {
    throw new Error(`News API error: ${response.statusText}`);
  }

  return JSON.parse<NewsAPIResponse>(response.text());
}

export function createFocusedSummary(
  articles: NewsArticle[],
  recentMessages: ChatMessage[],
): string {
  const request = new http.Request(
    "https://api.openai.com/v1/chat/completions",
  );
  request.headers.append("Content-Type", "application/json");

  const messages: OpenAIMessage[] = [
    { role: "system", content: FOCUSED_SUMMARY_SYSTEM_PROMPT },
    {
      role: "user",
      content: JSON.stringify({
        articles: articles,
        conversation: recentMessages,
      }),
    },
  ];

  const requestBody = new OpenAIChatInput();
  requestBody.messages = messages;
  requestBody.response_format = { type: "json_object" };

  const options = new http.RequestOptions();
  options.method = "POST";
  options.body = Content.from(JSON.stringify(requestBody));

  const response = http.fetch(request, options);
  if (response.status !== 200) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const openAIResponse = JSON.parse<OpenAIResponse>(response.text());
  const summaryResponse = JSON.parse<FocusedSummaryResponse>(
    openAIResponse.choices[0].message.content,
  );
  return summaryResponse.answer;
}
