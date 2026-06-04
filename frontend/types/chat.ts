// === 后端 API 对齐类型 ===

/** POST /api/v1/agent/chat 请求体（对齐后端 ChatDto） */
export interface ChatRequest {
  query: string;
  session_id: string;
  image_url?: string;
}

/** SSE 数据帧 */
export interface SSEFrame {
  type: 'waiting' | 'message' | 'done' | 'error';
  messages: string;
  extra?: SessionMeta | null;
}

/** 会话元数据（仅 done 帧携带） */
export interface SessionMeta {
  intent: string;
  summary: string;
  artifacts: string[];
  next_steps: string[];
}

/** 后端返回的消息结构 */
export interface ApiMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** 创建会话响应 */
export interface CreateSessionResponse {
  code: number;
  data: {
    session_id: string;
  };
}

/** 获取会话历史响应 */
export interface SessionMessagesResponse {
  code: number;
  data: {
    messages: ApiMessage[];
  };
}

/** 删除会话响应 */
export interface DeleteSessionResponse {
  code: number;
  data: {
    message: string;
  };
}

// === 前端内部类型 ===

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  imageUrl?: string;
  sessionMeta?: SessionMeta;
}

export interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: string;
}
