'use client';

import { useState } from 'react';
import { Menu, SquarePen, Trash2, X } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';

export default function Header() {
  const { sessions, fetchSessions, deleteSession, createNewSession } = useChatStore();
  const [isOpen, setIsOpen] = useState(false);

  const handleOpen = () => {
    fetchSessions();
    setIsOpen(true);
  };

  return (
    <>
      <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 bg-chef-bg/80 backdrop-blur-md border-b border-white/10">
        <button
          onClick={handleOpen}
          className="p-2 text-chef-text hover:opacity-70 transition"
          aria-label="打开历史会话"
        >
          <Menu className="w-6 h-6" />
        </button>

        <div className="text-center">
          <h1 className="font-serif text-xs uppercase tracking-[0.2em] text-chef-text">
            PRIVATE CHEF
          </h1>
          <p className="text-[10px] tracking-[0.4em] text-chef-text/80 mt-0.5 pl-1">私 厨</p>
        </div>

        <button
          onClick={createNewSession}
          className="p-2 text-chef-text hover:opacity-70 transition"
          aria-label="新建会话"
        >
          <SquarePen className="w-5 h-5" />
        </button>
      </header>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm animate-fadeIn"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 left-0 z-50 h-full w-[80vw] max-w-sm bg-chef-bg text-chef-text border-r border-white/10 p-4 transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-serif tracking-premium text-lg">历史会话</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 text-chef-text hover:opacity-70 transition"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto max-h-[80vh]">
          {sessions.length === 0 ? (
            <p className="text-sm text-chef-muted text-center py-8">暂无历史会话</p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className="group relative flex items-center justify-between p-3 rounded-xl bg-white/20 active:scale-[0.98] transition-all"
              >
                <div className="flex-1 min-w-0 pr-4">
                  <p className="font-medium truncate text-sm">{session.title}</p>
                  <p className="text-xs text-chef-muted truncate mt-1">{session.lastMessage}</p>
                </div>
                <button
                  onClick={() => deleteSession(session.id)}
                  className="text-red-400 p-2 opacity-80 active:scale-95 transition"
                  aria-label="删除会话"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
