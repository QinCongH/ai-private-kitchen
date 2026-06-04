'use client';

import { useEffect, useRef } from 'react';
import type { Message } from '@/types/chat';

interface ChatTimelineProps {
  messages: Message[];
  isTyping: boolean;
}

export default function ChatTimeline({ messages, isTyping }: ChatTimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  if (messages.length === 0 && !isTyping) {
    return (
      <div className="flex-1 overflow-y-auto p-4 bg-chef-bg flex items-center justify-center">
        <div className="text-center space-y-4 animate-fadeIn">
          <div className="w-16 h-16 mx-auto rounded-full bg-chef-accent/10 flex items-center justify-center">
            <span className="text-2xl">🍽</span>
          </div>
          <div>
            <h2 className="font-serif text-lg tracking-premium text-chef-text">
              欢迎使用私厨
            </h2>
            <p className="text-sm text-chef-muted mt-2 max-w-[240px]">
              告诉我您的口味偏好、场合或食材，为您定制专属菜单
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-chef-bg">
      {messages.map((msg) => {
        const isUser = msg.role === 'user';
        return (
          <div
            key={msg.id}
            className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} animate-slideUp`}
          >
            {/* AI custom payload card */}
            {!isUser && msg.customPayload && (
              <div className="w-full max-w-[85%] bg-chef-card backdrop-blur-md rounded-2xl p-4 border border-white/20 shadow-sm space-y-3 mb-2">
                {msg.content && (
                  <p className="text-sm text-chef-text leading-relaxed">{msg.content}</p>
                )}

                {/* Flavor tags */}
                {msg.customPayload.tags && msg.customPayload.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {msg.customPayload.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-xs bg-chef-accent/10 px-2.5 py-1 rounded-full text-chef-accent border border-chef-accent/20"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Wine pairing */}
                {msg.customPayload.winePairing && msg.customPayload.winePairing.length > 0 && (
                  <div className="pt-2 border-t border-white/20">
                    <span className="text-[10px] uppercase tracking-wider text-chef-muted block mb-1.5">
                      Wine Pairing
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.customPayload.winePairing.map((wine, idx) => (
                        <span
                          key={idx}
                          className="text-xs bg-white/50 px-2.5 py-1 rounded-full text-chef-text border border-white/40"
                        >
                          {wine}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Menu items */}
                {msg.customPayload.menuItems && msg.customPayload.menuItems.length > 0 && (
                  <div className="pt-2 border-t border-white/20 space-y-2">
                    {msg.customPayload.menuItems.map((item, idx) => (
                      <div key={idx} className="bg-white/30 rounded-xl p-3">
                        <p className="font-medium text-sm text-chef-text">{item.name}</p>
                        {item.description && (
                          <p className="text-xs text-chef-muted mt-1">{item.description}</p>
                        )}
                        {item.tags && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {item.tags.map((tag, tagIdx) => (
                              <span
                                key={tagIdx}
                                className="text-[10px] bg-chef-accent/5 px-2 py-0.5 rounded-full text-chef-muted"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Standard message bubble */}
            {(!msg.customPayload || isUser) && (
              <div
                className={`max-w-[75%] rounded-bubble px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                  isUser
                    ? 'bg-chef-bubble text-chef-text rounded-tr-sm'
                    : 'bg-chef-card text-chef-text rounded-tl-sm'
                }`}
              >
                {msg.content}
              </div>
            )}

            {/* Timestamp */}
            <span className="text-[10px] text-chef-muted/70 mt-1 px-1">{msg.timestamp}</span>
          </div>
        );
      })}

      {/* Typing indicator */}
      {isTyping && (
        <div className="flex items-center space-x-1 bg-chef-card px-4 py-3 rounded-bubble rounded-tl-sm w-16 shadow-sm animate-fadeIn">
          <span
            className="w-1.5 h-1.5 bg-chef-text/60 rounded-full animate-bounce"
            style={{ animationDelay: '0ms' }}
          />
          <span
            className="w-1.5 h-1.5 bg-chef-text/60 rounded-full animate-bounce"
            style={{ animationDelay: '150ms' }}
          />
          <span
            className="w-1.5 h-1.5 bg-chef-text/60 rounded-full animate-bounce"
            style={{ animationDelay: '300ms' }}
          />
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
