export interface ChatResponse {
  reply: string;
  session_id: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface SessionMessagesResponse {
  messages: Message[];
}
