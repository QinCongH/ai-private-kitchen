import type {
  SSEFrame,
  ChatRequest,
  SessionMessagesResponse,
} from '@/types/chat';

const API_BASE = '/api/v1/agent';

// === SSE 流式对话 ===

export interface StreamCallbacks {
  onWaiting?: (message: string) => void;
  onMessage?: (chunk: string) => void;
  onDone?: (frame: SSEFrame) => void;
  onError?: (message: string) => void;
}

/**
 * 发送消息并以 SSE 流式接收回复
 * POST /api/v1/agent/chat
 * 请求体对齐后端 ChatDto: { query, session_id?, image_url? }
 */
export async function streamChat(
  request: ChatRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const body: Record<string, string> = {
    query: request.query,
    session_id: request.session_id,
  };
  if (request.image_url) body.image_url = request.image_url;

  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        try {
          const frame: SSEFrame = JSON.parse(trimmed.slice(5));

          switch (frame.type) {
            case 'waiting':
              callbacks.onWaiting?.(frame.messages);
              break;
            case 'message':
              callbacks.onMessage?.(frame.messages);
              break;
            case 'done':
              callbacks.onDone?.(frame);
              return;
            case 'error':
              callbacks.onError?.(frame.messages);
              return;
          }
        } catch {
          // skip malformed frame
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// === REST 会话管理 ===

/** 获取会话历史消息 GET /api/v1/agent/session/:id/messages */
export async function getSessionMessages(
  sessionId: string,
): Promise<SessionMessagesResponse['data']['messages']> {
  const res = await fetch(`${API_BASE}/session/${sessionId}/messages`);
  if (!res.ok) throw new Error(`获取历史消息失败: ${res.status}`);
  const data: SessionMessagesResponse = await res.json();
  return data.data.messages;
}

/** 删除会话 DELETE /api/v1/agent/session/:id */
export async function deleteSession(sessionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/session/${sessionId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`删除会话失败: ${res.status}`);
}
