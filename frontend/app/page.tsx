'use client';

import Header from '@/components/Header';
import ChatTimeline from '@/components/ChatTimeline';
import InputBar from '@/components/InputBar';
import { useChatStore } from '@/store/useChatStore';

export default function HomePage() {
  const { messages, isTyping, isLoading, sendMessage } = useChatStore();

  return (
    <div className="flex flex-col h-[100dvh] bg-chef-bg">
      <Header />
      <ChatTimeline messages={messages} isTyping={isTyping} />
      <InputBar onSendMessage={sendMessage} isLoading={isLoading} />
    </div>
  );
}
