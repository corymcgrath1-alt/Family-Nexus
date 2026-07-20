import React from "react";
import { Link } from "wouter";
import { useListExperiences } from "@workspace/api-client-react";
import { Bookmark, BookmarkMinus, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function ShortlistTab() {
  const { data: experiences, isLoading } = useListExperiences(
    { shortlistedOnly: true },
    { query: { queryKey: ["experiences", "shortlisted"] } }
  );

  if (isLoading) {
    return <div className="p-6 animate-pulse">Loading shortlist...</div>;
  }

  if (!experiences || experiences.length === 0) {
    return (
      <div className="p-10 text-center max-w-md mx-auto mt-10 border border-border border-dashed rounded-2xl bg-card/50">
        <Bookmark className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
        <h3 className="text-xl font-serif mb-2">Nothing shortlisted yet</h3>
        <p className="text-muted-foreground text-sm mb-6">
          Shortlist experiences you want to try together.
        </p>
        <Link href="/together" className="text-primary font-medium hover:underline inline-flex items-center gap-1">
          Discover ideas <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 pt-0 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-serif font-medium">Saved for later ({experiences.length})</h2>
      </div>

      <div className="grid gap-4">
        {experiences.map((exp: any) => (
          <motion.div
            key={exp.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col sm:flex-row gap-4 p-4 bg-card border border-border rounded-xl hover-elevate transition-all"
          >
            <div className="w-full sm:w-48 h-32 rounded-lg bg-muted overflow-hidden shrink-0">
              <img src={exp.imageUrl} alt={exp.title} className="w-full h-full object-cover" />
            </div>

            <div className="flex-1 flex flex-col">
              <div className="flex justify-between items-start mb-1">
                <Link href={`/together/experiences/${exp.id}`} className="text-lg font-serif font-medium hover:underline line-clamp-1">
                  {exp.title}
                </Link>
                <button className="text-muted-foreground hover:text-destructive p-1 rounded-md hover:bg-destructive/10">
                  <BookmarkMinus className="w-4 h-4" />
                </button>
              </div>

              <div className="flex gap-3 text-xs text-muted-foreground mb-3 font-medium">
                <span>{exp.durationMinutes} mins</span>
                <span>Est. ${exp.costEstimate}</span>
                <span className="capitalize">{exp.energyLevel} energy</span>
              </div>

              <p className="text-sm text-muted-foreground line-clamp-2 mb-4 flex-1">
                {exp.description}
              </p>

              <div className="mt-auto flex justify-end">
                <Link
                  href={`/together/experiences/${exp.id}?action=invite`}
                  className="bg-secondary text-secondary-foreground px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
                >
                  Plan this
                </Link>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
