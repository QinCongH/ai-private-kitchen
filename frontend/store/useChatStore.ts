import { create } from 'zustand';
import type { ChatSession, Message } from '@/types/chat';

interface ChatState {
  sessions: ChatSession[];
  messages: Message[];
  currentSessionId: string | null;
  isTyping: boolean;
  isLoading: boolean;

  fetchSessions: () => Promise<void>;
  fetchMessages: (sessionId: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
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

  fetchSessions: async () => {
    try {
      // TODO: Replace with actual API call
      // const res = await fetch('/api/sessions');
      // const data = await res.json();
      // set({ sessions: data });
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    }
  },

  fetchMessages: async (sessionId: string) => {
    set({ isLoading: true });
    try {
      // TODO: Replace with actual API call
      // const res = await fetch(`/api/sessions/${sessionId}/messages`);
      // const data = await res.json();
      // set({ messages: data, currentSessionId: sessionId });
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  sendMessage: async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isTyping: true,
    }));

    try {
      // TODO: Replace with actual API call
      // const res = await fetch('/api/chat', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     content,
      //     sessionId: get().currentSessionId,
      //   }),
      // });
      // const data = await res.json();

      // Simulate AI response
      setTimeout(() => {
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '为您搭配的完美菜单已生成。',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          customPayload: {
            tags: ['清雅', '时令'],
            winePairing: ["Puligny-Montrachet '21", 'Meursault'],
            menuItems: [
              { name: '松茸清汤', description: '云南野生松茸，配以老母鸡慢炖高汤', tags: ['鲜香', '滋补'] },
              { name: '香煎和牛', description: 'A5和牛，低温慢煎至五分熟', tags: ['嫩滑', '浓郁'] },
            ],
          },
        };
        set((state) => ({
          messages: [...state.messages, aiMessage],
          isTyping: false,
        }));
      }, 1500);
    } catch (error) {
      console.error('Failed to send message:', error);
      set({ isTyping: false });
    }
  },

  deleteSession: async (id: string) => {
    const previousSessions = get().sessions;

    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
    }));

    try {
      // TODO: Replace with actual API call
      // await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
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
