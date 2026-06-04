'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, ArrowUp } from 'lucide-react';

interface InputBarProps {
  onSendMessage: (text: string) => void;
  isLoading?: boolean;
}

const QUICK_TAGS = [
  "Today's Menu",
  "Chef's Special",
  '时令推荐',
  'Wine Pairing',
  '快手菜谱',
];

export default function InputBar({ onSendMessage, isLoading = false }: InputBarProps) {
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 96)}px`;
    }
  }, [inputValue]);

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;
    onSendMessage(inputValue);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-4 bg-chef-bg border-t border-white/10 space-y-3 safe-bottom">
      {/* Quick tags */}
      <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1">
        {QUICK_TAGS.map((tag) => (
          <button
            key={tag}
            onClick={() => setInputValue(tag)}
            className="whitespace-nowrap text-xs bg-white/30 text-chef-text px-4 py-1.5 rounded-full border border-white/40 hover:bg-white/50 transition active:scale-95"
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div className="flex items-end bg-white/40 border border-white/40 rounded-input p-2 pl-4 shadow-inner space-x-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask your private chef..."
          disabled={isLoading}
          className="flex-1 max-h-24 bg-transparent border-0 focus:ring-0 focus:outline-none resize-none text-sm text-chef-text placeholder-chef-muted/60 py-1 font-sans disabled:opacity-50"
        />

        <button className="p-2 text-chef-text hover:opacity-70 transition" aria-label="语音输入">
          <Mic className="w-5 h-5" />
        </button>

        <button
          onClick={handleSend}
          disabled={!inputValue.trim() || isLoading}
          className={`p-2.5 rounded-full text-white transition-all duration-300 shadow-md ${
            inputValue.trim() && !isLoading
              ? 'bg-chef-accent opacity-100 scale-100 active:scale-95'
              : 'bg-chef-accent/40 opacity-50 scale-95 cursor-not-allowed'
          }`}
          aria-label="发送"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      </div>

      <p className="text-[9px] text-center text-chef-muted/50 font-sans tracking-widest uppercase">
        AI Private Chef
      </p>
    </div>
  );
}
