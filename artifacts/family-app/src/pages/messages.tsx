import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { apiSendMessage } from '@/lib/api';
import { API_BASE } from '@/lib/api-base';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { MessageCircle, Send, Bookmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday } from 'date-fns';

const TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  message: { bg: 'transparent', text: 'transparent', label: 'Message' },
  feeling: { bg: '#F3E8FF', text: '#7C3AED', label: 'Feeling' },
  request: { bg: '#DBEAFE', text: '#1D4ED8', label: 'Request' },
  promise: { bg: '#CCFBF1', text: '#0F766E', label: 'Promise' },
  plan: { bg: '#F1F5F9', text: '#475569', label: 'Plan' },
  decision: { bg: '#FEF3C7', text: '#B45309', label: 'Decision' },
  appreciation: { bg: '#DCFCE7', text: '#15803D', label: 'Appreciation' },
  boundary: { bg: '#FEE2E2', text: '#B91C1C', label: 'Boundary' },
  'need-support': { bg: '#FFEDD5', text: '#C2410C', label: 'Need support' },
  'need-space': { bg: '#F3F4F6', text: '#4B5563', label: 'Need space' },
  'please-listen': { bg: '#FCE7F3', text: '#BE185D', label: 'Please listen' },
};

const MSG_TYPES = Object.entries(TYPE_COLORS).filter(([k]) => k !== 'message');

type Message = {
  id: number;
  senderId: number;
  senderName: string;
  senderInitials: string;
  senderColor: string;
  body: string;
  messageType: string;
  createdAt: string;
  hasExperienceMention: boolean;
  experienceMentionText?: string;
  savedAsMemoryId?: number | null;
};

function dateSeparatorLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMMM d, yyyy');
}

function groupByDate(messages: Message[]): Array<{ date: string; messages: Message[] }> {
  const groups: Array<{ date: string; messages: Message[] }> = [];
  for (const msg of messages) {
    const date = msg.createdAt.split('T')[0];
    const last = groups[groups.length - 1];
    if (last && last.date === date) {
      last.messages.push(msg);
    } else {
      groups.push({ date, messages: [msg] });
    }
  }
  return groups;
}

export default function MessagesPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [text, setText] = useState('');
  const [msgType, setMsgType] = useState('message');
  const [isSending, setIsSending] = useState(false);
  const [savedMemories, setSavedMemories] = useState<Record<number, boolean>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/messages`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const atBottom = isAtBottomRef.current;
      setMessages(data);
      if (atBottom) {
        setTimeout(() => {
          if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
          }
        }, 50);
      }
    } catch {}
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchMessages();
    const id = setInterval(fetchMessages, 5000);
    return () => clearInterval(id);
  }, [fetchMessages]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const handleSend = async () => {
    const body = text.trim();
    if (!body || isSending) return;
    setIsSending(true);
    try {
      await apiSendMessage(body, msgType);
      setText('');
      setMsgType('message');
      isAtBottomRef.current = true;
      await fetchMessages();
    } catch {}
    setIsSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSaveMemory = async (msg: Message) => {
    try {
      await fetch(`${API_BASE}/memories`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: msg.experienceMentionText,
          sourceType: 'message',
          sourceMessage: msg.body,
          mentionedBy: msg.senderId,
        }),
      });
      setSavedMemories(prev => ({ ...prev, [msg.id]: true }));
    } catch {}
  };

  if (isLoading) {
    return (
      <div className="p-6 animate-pulse space-y-4">
        <div className="h-12 w-full bg-muted rounded-xl" />
        <div className="h-24 w-2/3 bg-muted rounded-xl ml-auto" />
        <div className="h-24 w-2/3 bg-muted rounded-xl mr-auto" />
      </div>
    );
  }

  const groups = groupByDate(messages);

  return (
    <div className="flex flex-col h-full bg-background max-w-3xl mx-auto w-full border-x border-border shadow-sm">
      <header className="p-4 border-b border-border bg-card flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-serif font-medium">Family Thread</h1>
          <p className="text-xs text-muted-foreground">Your household</p>
        </div>
      </header>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-6"
      >
        {groups.map(group => (
          <div key={group.date}>
            <div className="text-center my-4">
              <span className="text-xs font-medium text-muted-foreground bg-secondary px-3 py-1 rounded-full uppercase tracking-wider">
                {dateSeparatorLabel(group.date)}
              </span>
            </div>
            <div className="space-y-4">
              {group.messages.map(msg => {
                const isMe = msg.senderId === user?.id;
                const isSaved = msg.savedAsMemoryId || savedMemories[msg.id];
                const typeInfo = TYPE_COLORS[msg.messageType] ?? TYPE_COLORS.message;

                return (
                  <div key={msg.id} className={cn('flex flex-col', isMe ? 'items-end' : 'items-start')}>
                    <div className="flex items-end gap-2 max-w-[85%]">
                      {!isMe && (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mb-1 text-white"
                          style={{ backgroundColor: msg.senderColor ?? '#4A7C59' }}
                        >
                          {msg.senderInitials ?? msg.senderName?.[0]?.toUpperCase() ?? '?'}
                        </div>
                      )}

                      <div className={cn(
                        'px-4 py-2.5 rounded-2xl text-sm relative',
                        isMe
                          ? 'bg-[#4A7C59] text-white rounded-br-sm'
                          : 'bg-white border border-stone-100 rounded-bl-sm text-foreground',
                      )}>
                        {msg.messageType !== 'message' && (
                          <span
                            className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-1.5"
                            style={{ backgroundColor: typeInfo.bg, color: typeInfo.text }}
                          >
                            {typeInfo.label}
                          </span>
                        )}
                        <p className="whitespace-pre-wrap">{msg.body}</p>
                        <span className={cn(
                          'text-[10px] mt-1.5 block opacity-70',
                          isMe ? 'text-right' : '',
                        )}>
                          {format(new Date(msg.createdAt), 'h:mm a')}
                        </span>
                      </div>
                    </div>

                    {msg.hasExperienceMention && !isSaved && (
                      <button
                        onClick={() => handleSaveMemory(msg)}
                        className={cn(
                          'mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-stone-200 rounded-lg px-3 py-1.5 bg-stone-50 transition-colors',
                          isMe ? '' : 'ml-10',
                        )}
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                        💡 Sounds like an experience idea — save to memories?
                      </button>
                    )}

                    {msg.hasExperienceMention && isSaved && (
                      <p className={cn('mt-1 text-xs text-muted-foreground flex items-center gap-1', isMe ? '' : 'ml-10')}>
                        ✓ Saved to Memories
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Send bar */}
      <div className="p-3 bg-card border-t border-border">
        <div className="flex items-end gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0 self-end mb-0.5">
                <MessageCircle className="w-5 h-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start" side="top">
              <div className="grid gap-1">
                {MSG_TYPES.map(([key, val]) => (
                  <button
                    key={key}
                    onClick={() => setMsgType(key)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-left hover:bg-secondary transition-colors',
                      msgType === key && 'bg-secondary font-medium',
                    )}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: val.text !== 'transparent' ? val.text : '#94a3b8' }}
                    />
                    {val.label}
                  </button>
                ))}
                <button
                  onClick={() => setMsgType('message')}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-left hover:bg-secondary transition-colors',
                    msgType === 'message' && 'bg-secondary font-medium',
                  )}
                >
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-slate-400" />
                  Plain message
                </button>
              </div>
            </PopoverContent>
          </Popover>

          <div className="flex-1 flex flex-col">
            {msgType !== 'message' && (
              <span
                className="self-start text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-1"
                style={{
                  backgroundColor: TYPE_COLORS[msgType]?.bg ?? '#F1F5F9',
                  color: TYPE_COLORS[msgType]?.text ?? '#475569',
                }}
              >
                {TYPE_COLORS[msgType]?.label}
              </span>
            )}
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message family… (Ctrl+Enter to send)"
              rows={1}
              className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30 focus:border-[#4A7C59] min-h-[40px] max-h-32 overflow-y-auto"
              style={{ fieldSizing: 'content' } as React.CSSProperties}
            />
          </div>

          <Button
            onClick={handleSend}
            disabled={!text.trim() || isSending}
            className="shrink-0 self-end bg-[#4A7C59] hover:bg-[#3d6b4c] text-white"
            size="icon"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
