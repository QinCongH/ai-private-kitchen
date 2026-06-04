'use client';

import { useEffect, useRef } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
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
            <Sparkles className="w-8 h-8 text-chef-accent" />
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
            {/* AI message bubble + session meta card */}
            {!isUser && (
              <div className="w-full max-w-[85%] space-y-2">
                {/* Message content */}
                {msg.content && (
                  <div className="bg-chef-card backdrop-blur-md rounded-2xl p-4 border border-white/20 shadow-sm">
                    <p className="text-sm text-chef-text leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  </div>
                )}

                {/* Session metadata from done frame */}
                {msg.sessionMeta && (
                  <div className="bg-chef-card/60 backdrop-blur-md rounded-2xl p-4 border border-white/15 shadow-sm space-y-3">
                    {/* Intent */}
                    {msg.sessionMeta.intent && (
                      <p className="text-xs text-chef-muted">
                        <span className="font-medium text-chef-text">意图：</span>
                        {msg.sessionMeta.intent}
                      </p>
                    )}

                    {/* Artifacts */}
                    {msg.sessionMeta.artifacts && msg.sessionMeta.artifacts.length > 0 && (
                      <div className="pt-2 border-t border-white/15">
                        <span className="text-[10px] uppercase tracking-wider text-chef-muted block mb-1.5">
                          Artifacts
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.sessionMeta.artifacts.map((item, idx) => (
                            <span
                              key={idx}
                              className="text-xs bg-chef-accent/10 px-2.5 py-1 rounded-full text-chef-accent border border-chef-accent/20"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Next steps */}
                    {msg.sessionMeta.next_steps && msg.sessionMeta.next_steps.length > 0 && (
                      <div className="pt-2 border-t border-white/15">
                        <span className="text-[10px] uppercase tracking-wider text-chef-muted block mb-1.5">
                          Suggested Next Steps
                        </span>
                        <div className="space-y-1">
                          {msg.sessionMeta.next_steps.map((step, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 text-xs text-chef-text/80"
                            >
                              <ArrowRight className="w-3 h-3 text-chef-accent/60 shrink-0" />
                              <span>{step}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* User message bubble */}
            {isUser && (
              <div className="max-w-[75%] space-y-2">
                {msg.imageUrl && (
                  <div className="rounded-2xl overflow-hidden border border-white/20 shadow-sm">
                    <img
                      src={msg.imageUrl}
                      alt="用户上传图片"
                      className="w-full max-h-48 object-cover"
                    />
                  </div>
                )}
                <div className="rounded-bubble bg-chef-bubble text-chef-text rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed shadow-sm">
                  {msg.content}
                </div>
              </div>
            )}

            {/* Timestamp */}
            {msg.timestamp && (
              <span className="text-[10px] text-chef-muted/70 mt-1 px-1">{msg.timestamp}</span>
            )}
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
