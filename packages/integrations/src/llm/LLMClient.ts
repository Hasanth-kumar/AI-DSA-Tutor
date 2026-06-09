export interface LLMChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMClient {
  isConfigured(): boolean;
  generate(prompt: string): Promise<string | null>;
  chat(messages: LLMChatMessage[]): Promise<string | null>;
}
