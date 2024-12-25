export * from "./models";
export {
  createThread,
  deleteThread,
  getAllThreads,
  getCurrentUserId,
  getReply,
  getThreadById,
  getThreadMessages,
} from "./chat";
export function sayHello(name: string | null = null): string {
  return `Hello, ${name || "World"}!`;
}
