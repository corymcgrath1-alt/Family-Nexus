import React, { useState } from "react";
import { useListMemories, useUpdateMemory } from "@workspace/api-client-react";
import { Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const STATUS_TABS = ["active", "completed", "postponed", "archived"];

export default function MemoriesTab() {
  const [statusFilter, setStatusFilter] = useState("active");
  const { data: memories, isLoading } = useListMemories(
    { status: statusFilter as any },
    { query: { queryKey: ["memories", statusFilter] } }
  );

  const updateMemory = useUpdateMemory();

  if (isLoading) return <div className="p-6">Loading memories...</div>;

  return (
    <div className="p-6 md:p-10 pt-0 max-w-5xl mx-auto space-y-6">
      <div className="flex overflow-x-auto gap-2 pb-2 no-scrollbar">
        {STATUS_TABS.map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors",
              statusFilter === status
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            {status}
          </button>
        ))}
      </div>

      {(!memories || memories.length === 0) ? (
        <div className="text-center py-20 border border-dashed border-border rounded-2xl bg-card/50">
          <Bookmark className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="font-serif text-lg mb-1">Nothing saved yet</p>
          <p className="text-muted-foreground text-sm">Save ideas from messages or browse the catalogue.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {memories.map((memory: any) => (
              <motion.div
                key={memory.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-card border border-border rounded-xl p-5 hover-elevate transition-all flex flex-col"
              >
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-serif font-medium text-lg text-foreground line-clamp-2 leading-tight">
                    {memory.title}
                  </h3>
                  <select
                    value={memory.status}
                    onChange={(e) => updateMemory.mutate({ id: memory.id, data: { status: e.target.value as any } })}
                    className="text-xs bg-transparent border-none text-muted-foreground hover:text-foreground cursor-pointer focus:outline-none ml-2"
                  >
                    <option value="active">Active</option>
                    <option value="postponed">Postponed</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>

                {memory.description && (
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-3">{memory.description}</p>
                )}

                {memory.sourceMessage && (
                  <div className="bg-secondary/50 p-3 rounded-lg text-sm italic text-secondary-foreground mb-4 border-l-2 border-primary/40">
                    "{memory.sourceMessage}"
                    <span className="block text-[10px] uppercase tracking-wider not-italic mt-2 text-muted-foreground font-bold">
                      Saved from chat
                    </span>
                  </div>
                )}

                <div className="mt-auto pt-4 flex items-center justify-between border-t border-border/50 text-xs text-muted-foreground">
                  <span>Season: {memory.season || 'Any'}</span>
                  {memory.budgetEstimate && <span>Est: ${memory.budgetEstimate}</span>}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
