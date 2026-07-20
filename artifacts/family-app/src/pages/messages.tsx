import React, { useState } from "react";
import { Link } from "wouter";
import { useListMessages, useCreateMemory } from "@workspace/api-client-react";
import { useViewerStore } from "@/store/viewer";
import { cn } from "@/lib/utils";
import { Heart, Plus, Search, MapPin, Coffee, Bookmark } from "lucide-react";
import { format } from "date-fns";

export default function MessagesPage() {
  const { viewerId } = useViewerStore();
  const { data: messages, isLoading } = useListMessages({ query: { queryKey: ["messages"] } });
  const createMemory = useCreateMemory();
  const [optimisticMemories, setOptimisticMemories] = useState<Record<string, boolean>>({});

  const handleSaveMemory = (msg: any) => {
    if (!msg.experienceMentionText) return;
    
    createMemory.mutate({
      data: {
        title: msg.experienceMentionText,
        sourceType: "message",
        sourceMessage: msg.content,
        mentionedBy: msg.senderId
      }
    }, {
      onSuccess: () => {
        setOptimisticMemories(prev => ({ ...prev, [msg.id]: true }));
      }
    });
  };

  if (isLoading) {
    return <div className="p-6 animate-pulse space-y-4">
      <div className="h-12 w-full bg-muted rounded-xl"></div>
      <div className="h-24 w-2/3 bg-muted rounded-xl ml-auto"></div>
      <div className="h-24 w-2/3 bg-muted rounded-xl mr-auto"></div>
    </div>;
  }

  return (
    <div className="flex flex-col h-full bg-background max-w-3xl mx-auto w-full border-x border-border shadow-sm">
      <header className="p-4 border-b border-border bg-card flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-serif font-medium">Family Thread</h1>
          <p className="text-xs text-muted-foreground">Alex, Morgan, Jamie</p>
        </div>
        <div className="flex gap-2">
          <button className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground hover:bg-secondary/80">
            <Search className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="text-center my-6">
          <span className="text-xs font-medium text-muted-foreground bg-secondary px-3 py-1 rounded-full uppercase tracking-wider">Today</span>
        </div>

        {messages?.map((msg) => {
          const isMe = msg.senderId === viewerId;
          const isSaved = msg.savedAsMemoryId || optimisticMemories[msg.id];
          
          return (
            <div key={msg.id} className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
              <div className="flex items-end gap-2 max-w-[85%]">
                {!isMe && (
                  <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0 mb-1">
                    {msg.senderId[0].toUpperCase()}
                  </div>
                )}
                
                <div className={cn(
                  "px-4 py-3 rounded-2xl text-sm relative group",
                  isMe 
                    ? "bg-primary text-primary-foreground rounded-br-sm" 
                    : "bg-card border border-border text-card-foreground rounded-bl-sm"
                )}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <span className={cn(
                    "text-[10px] mt-2 block opacity-70",
                    isMe ? "text-primary-foreground/80 text-right" : "text-muted-foreground"
                  )}>
                    {format(new Date(msg.createdAt), 'h:mm a')}
                  </span>
                </div>
              </div>

              {msg.hasExperienceMention && !isSaved && !isMe && (
                <div className="mt-2 ml-10 w-full max-w-[80%] bg-accent/10 border border-accent/20 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <Bookmark className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Save this idea?</p>
                      <p className="text-xs text-muted-foreground italic">"{msg.experienceMentionText}"</p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button 
                      onClick={() => handleSaveMemory(msg)}
                      className="text-xs font-medium bg-accent text-accent-foreground px-3 py-1.5 rounded-lg hover:bg-accent/90"
                    >
                      Save to Memories
                    </button>
                  </div>
                </div>
              )}

              {msg.hasExperienceMention && isSaved && !isMe && (
                <div className="mt-1 ml-10 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                  <span>Saved to Memories</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-4 bg-card border-t border-border">
        <div className="flex items-center gap-2 bg-background border border-border rounded-full p-1 pl-4 shadow-sm focus-within:ring-1 focus-within:ring-ring">
          <input 
            type="text" 
            placeholder="Message family..." 
            className="flex-1 bg-transparent border-none focus:outline-none text-sm py-2"
          />
          <button className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground shrink-0">
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckCircle2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}
