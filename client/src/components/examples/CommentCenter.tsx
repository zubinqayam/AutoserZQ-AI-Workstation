import { useState } from "react";
import CommentCenter from '../CommentCenter';

export default function CommentCenterExample() {
  const [messages, setMessages] = useState([
    { id: '1', authorUid: 'other', text: 'Welcome to the research session!', isAI: false },
    { id: '2', authorUid: 'me', text: 'Thanks! Looking forward to collaborating.' },
    { id: '3', authorUid: 'ai', text: 'I can help you with research synthesis and gap analysis.', isAI: true },
  ]);

  const handleSend = (text: string) => {
    setMessages([...messages, { 
      id: Date.now().toString(), 
      authorUid: 'me', 
      text 
    }]);
  };

  return (
    <div className="h-screen">
      <CommentCenter
        messages={messages}
        currentUserId="me"
        onSendMessage={handleSend}
        aiEnabled={true}
      />
    </div>
  );
}
