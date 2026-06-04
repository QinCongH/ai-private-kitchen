export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  customPayload?: CustomPayload;
}

export interface CustomPayload {
  tags?: string[];
  winePairing?: string[];
  menuItems?: MenuItem[];
}

export interface MenuItem {
  name: string;
  description?: string;
  tags?: string[];
}

export interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: string;
  messageCount?: number;
}

export interface SendMessageRequest {
  content: string;
  sessionId?: string;
}

export interface SendMessageResponse {
  message: Message;
  sessionId: string;
}
