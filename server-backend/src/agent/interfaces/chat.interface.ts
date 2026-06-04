/** SSE 帧类型枚举 */
export enum SSEFrameType {
  WAITING = 'waiting',
  MESSAGE = 'message',
  DONE = 'done',
  ERROR = 'error',
}

/** 会话元数据，仅在 done 帧中返回 */
export interface SessionMeta {
  intent: string;
  summary: string;
  artifacts: string[];
  next_steps: string[];
}

/** SSE 数据帧统一格式 */
export interface SSEFrame {
  type: SSEFrameType;
  messages: string;
  extra?: SessionMeta | null;
}

/** 历史消息 */
export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/** 会话历史响应 */
export interface SessionMessagesResponse {
  messages: Message[];
}

/** 创建会话响应 */
export interface CreateSessionResponse {
  session_id: string;
}
