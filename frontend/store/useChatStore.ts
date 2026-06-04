import { create } from 'zustand';
import type { ChatSession, Message, SessionMeta } from '@/types/chat';
import * as api from '@/lib/api';

/** 生成前端 session_id */
function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

interface ChatState {
  sessions: ChatSession[];
  messages: Message[];
  currentSessionId: string | null;
  isTyping: boolean;
  isLoading: boolean;
  abortController: AbortController | null;
  streamingText: string;

  fetchSessions: () => Promise<void>;
  fetchMessages: (sessionId: string) => Promise<void>;
  sendMessage: (content: string, imageUrl?: string) => Promise<void>;
  stopStreaming: () => void;
  deleteSession: (id: string) => Promise<void>;
  createNewSession: () => void;
  setCurrentSession: (id: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  messages: [],
  currentSessionId: null,
  isTyping: false,
  isLoading: false,
  abortController: null,
  streamingText: '',

  fetchSessions: async () => {},

  fetchMessages: async (sessionId: string) => {
    set({ isLoading: true });
    try {
      const apiMessages = await api.getSessionMessages(sessionId);
      const messages: Message[] = apiMessages.map((m, i) => ({
        id: `${sessionId}-${i}`,
        role: m.role,
        content: m.content,
        timestamp: '',
      }));
      set({ messages, currentSessionId: sessionId });
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  sendMessage: async (content: string, imageUrl?: string) => {
    const { currentSessionId, abortController: existing } = get();

    if (existing) existing.abort();

    // 首次发消息时前端生成 session_id
    const sessionId = currentSessionId ?? generateSessionId();

    const ac = new AbortController();

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      imageUrl,
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      currentSessionId: sessionId,
      isTyping: true,
      abortController: ac,
      streamingText: '',
    }));

    const aiId = (Date.now() + 1).toString();
    const aiMessage: Message = {
      id: aiId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    set((state) => ({
      messages: [...state.messages, aiMessage],
    }));

    let accumulated = '';

    try {
      await api.streamChat(
        {
          query: content,
          session_id: sessionId,
          image_url: imageUrl,
        },
        {
          onWaiting: () => {},
          onMessage: (chunk) => {
            accumulated += chunk;
            set((state) => ({
              messages: state.messages.map((m) =>
                m.id === aiId ? { ...m, content: accumulated } : m,
              ),
              streamingText: accumulated,
            }));
          },
          onDone: (frame) => {
            const meta: SessionMeta | undefined = frame.extra ?? undefined;
            set((state) => {
              const updatedMessages = state.messages.map((m) =>
                m.id === aiId
                  ? { ...m, content: accumulated || m.content, sessionMeta: meta }
                  : m,
              );

              // 将当前会话加入本地 sessions 列表
              const exists = state.sessions.find((s) => s.id === sessionId);
              const newSessions = exists
                ? state.sessions
                : [
                    {
                      id: sessionId,
                      title: content.slice(0, 20),
                      lastMessage: accumulated.slice(0, 30),
                      timestamp: new Date().toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                    },
                    ...state.sessions,
                  ];

              return {
                messages: updatedMessages,
                sessions: newSessions,
                isTyping: false,
                abortController: null,
                streamingText: '',
              };
            });
          },
          onError: (errMsg) => {
            set((state) => ({
              messages: state.messages.map((m) =>
                m.id === aiId ? { ...m, content: `Error: ${errMsg}` } : m,
              ),
              isTyping: false,
              abortController: null,
              streamingText: '',
            }));
          },
        },
        ac.signal,
      );
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('Failed to send message:', error);
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === aiId ? { ...m, content: '发送失败，请稍后重试' } : m,
        ),
        isTyping: false,
        abortController: null,
        streamingText: '',
      }));
    }
  },

  stopStreaming: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
      set({ isTyping: false, abortController: null, streamingText: '' });
    }
  },

  deleteSession: async (id: string) => {
    const previousSessions = get().sessions;
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
    }));
    try {
      await api.deleteSession(id);
    } catch (error) {
      set({ sessions: previousSessions });
      console.error('Failed to delete session:', error);
    }
  },

  createNewSession: () => {
    set({ messages: [], currentSessionId: null });
  },

  setCurrentSession: (id: string) => {
    set({ currentSessionId: id });
    get().fetchMessages(id);
  },
}));
