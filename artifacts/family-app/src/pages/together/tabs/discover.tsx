import React, { useState } from "react";
import { Link } from "wouter";
import { useListExperiences, useSearchExperiences, useSaveExperience, useHideExperience, useShortlistExperience } from "@workspace/api-client-react";
import { Search, SlidersHorizontal, Heart, EyeOff, BookmarkPlus, MapPin, Clock, DollarSign, Zap, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const TIMEFRAMES = [
  { id: "right-now", label: "Right Now" },
  { id: "this-week", label: "This Week" },
  { id: "this-weekend", label: "This Weekend" },
  { id: "this-month", label: "This Month" },
  { id: "this-season", label: "This Season" },
  { id: "this-year", label: "This Year" },
  { id: "surprise", label: "Surprise Them", icon: Sparkles }
] as const;

export default function DiscoverTab() {
  const [activeTimeframe, setActiveTimeframe] = useState<string>("this-weekend");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Queries
  const { data: listData, isLoading: listLoading } = useListExperiences(
    { timeframe: activeTimeframe as any }, 
    { query: { enabled: !isSearching, queryKey: ["experiences", "list", activeTimeframe] } }
  );

  const { data: searchData, isLoading: searchLoading } = useSearchExperiences(
    { q: searchQuery },
    { query: { enabled: isSearching && searchQuery.length > 2, queryKey: ["experiences", "search", searchQuery] } }
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim().length > 0) setIsSearching(true);
    else setIsSearching(false);
  };

  const experiences = isSearching ? searchData?.experiences : listData;
  const isLoading = isSearching ? searchLoading : listLoading;
  const chips = isSearching ? searchData?.parsedFilters?.chips : [];

  return (
    <div className="p-6 md:p-10 pt-0 max-w-5xl mx-auto space-y-8">
      
      {/* Search & Filters */}
      <div className="space-y-4">
        <form onSubmit={handleSearchSubmit} className="relative flex items-center w-full group">
          <Search className="absolute left-4 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value === "") setIsSearching(false);
            }}
            placeholder="Try: romantic Saturday after 7pm under $75 near downtown..."
            className="w-full pl-12 pr-14 py-4 rounded-xl border border-border bg-card text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
          />
          <button 
            type="button" 
            onClick={() => setShowFilters(!showFilters)}
            className="absolute right-4 p-2 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <SlidersHorizontal className="w-5 h-5" />
          </button>
        </form>

        {/* Filter Chips */}
        {chips && chips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {chips.map(chip => (
              <span key={chip.key} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-medium border border-border/50">
                {chip.label}: {chip.value}
                {chip.editable && (
                  <button className="hover:text-foreground hover:bg-black/5 rounded-full p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))}
            <button onClick={() => {setSearchQuery(""); setIsSearching(false);}} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 ml-2">
              Clear search
            </button>
          </div>
        )}

        {/* Timeframe Tabs */}
        {!isSearching && (
          <div className="flex overflow-x-auto no-scrollbar gap-2 pb-2">
            {TIMEFRAMES.map((tf) => {
              const Icon = (tf as any).icon;
              return (
                <button
                  key={tf.id}
                  onClick={() => setActiveTimeframe(tf.id)}
                  className={cn(
                    "whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5",
                    activeTimeframe === tf.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-card border border-border text-foreground hover:bg-secondary"
                  )}
                >
                  {Icon && <Icon className="w-3.5 h-3.5" />}
                  {tf.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="space-y-6">
        {isLoading ? (
          <div className="grid md:grid-cols-2 gap-6">
            {[1,2,3,4].map(i => (
              <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden h-[400px] animate-pulse">
                <div className="h-48 bg-muted w-full" />
                <div className="p-5 space-y-3">
                  <div className="h-6 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-16 bg-muted rounded w-full mt-4" />
                </div>
              </div>
            ))}
          </div>
        ) : experiences?.length === 0 ? (
          <div className="text-center py-20 px-4 border border-dashed border-border rounded-2xl bg-card/50">
            <h3 className="text-xl font-serif text-foreground mb-2">No experiences found</h3>
            <p className="text-muted-foreground">Try adjusting your filters or search query.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-2 gap-6 md:gap-8">
            <AnimatePresence>
              {experiences?.filter(e => !e.isHidden).map((exp) => (
                <ExperienceCard key={exp.id} experience={exp} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

function ExperienceCard({ experience }: { experience: any }) {
  const saveExp = useSaveExperience();
  const hideExp = useHideExperience();
  const shortlistExp = useShortlistExperience();

  const handleAction = (e: React.MouseEvent, action: 'save' | 'hide' | 'shortlist') => {
    e.preventDefault();
    if (action === 'save') saveExp.mutate({ id: experience.id, data: { value: !experience.isSaved } });
    if (action === 'hide') hideExp.mutate({ id: experience.id, data: { value: !experience.isHidden } });
    if (action === 'shortlist') shortlistExp.mutate({ id: experience.id, data: { value: !experience.isShortlisted } });
  };

  const getEnergyColor = (level: string) => {
    if (level === 'low') return 'bg-blue-300';
    if (level === 'medium') return 'bg-amber-400';
    if (level === 'high') return 'bg-rose-400';
    return 'bg-gray-300';
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="group rounded-2xl border border-border bg-card overflow-hidden hover-elevate transition-all shadow-sm flex flex-col h-full relative"
    >
      {/* Floating Actions */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={(e) => handleAction(e, 'hide')}
          className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/60"
          title="Hide this suggestion"
        >
          <EyeOff className="w-4 h-4" />
        </button>
      </div>

      <div className="relative h-48 sm:h-56 shrink-0 overflow-hidden bg-muted">
        <img 
          src={experience.imageUrl} 
          alt={experience.title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        
        {experience.surpriseEligible && (
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-accent text-accent-foreground text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm">
            <Sparkles className="w-3 h-3" />
            Surprise Eligible
          </div>
        )}

        <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end">
          <div className="flex gap-1">
            <span className="px-2 py-1 rounded-md bg-white/20 backdrop-blur-md text-white text-xs font-medium border border-white/10">
              {experience.category || 'Activity'}
            </span>
            {experience.needsChildcare && (
              <span className="px-2 py-1 rounded-md bg-rose-500/80 backdrop-blur-md text-white text-xs font-medium border border-white/10">
                Childcare Needed
              </span>
            )}
          </div>
          
          <div className="flex -space-x-2">
            {experience.participants?.map((p: string, i: number) => (
              <div key={i} className="w-7 h-7 rounded-full border-2 border-white bg-secondary text-secondary-foreground flex items-center justify-center text-[10px] font-bold shadow-sm z-10">
                {p[0].toUpperCase()}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-5 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-2 gap-4">
          <h3 className="font-serif text-xl font-medium text-foreground leading-tight line-clamp-2">
            <Link href={`/together/experiences/${experience.id}`} className="hover:underline">
              {experience.title}
            </Link>
          </h3>
          <div className="flex items-center gap-1.5 shrink-0">
            <button 
              onClick={(e) => handleAction(e, 'shortlist')}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                experience.isShortlisted ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-secondary"
              )}
            >
              <BookmarkPlus className={cn("w-5 h-5", experience.isShortlisted && "fill-current")} />
            </button>
            <button 
              onClick={(e) => handleAction(e, 'save')}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                experience.isSaved ? "text-rose-500 bg-rose-500/10" : "text-muted-foreground hover:bg-secondary"
              )}
            >
              <Heart className={cn("w-5 h-5", experience.isSaved && "fill-current")} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground font-medium mb-4">
          <div className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {experience.durationMinutes}m
          </div>
          <div className="flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5" />
            Est. ${experience.costEstimate}
          </div>
          {experience.distanceMiles && (
            <div className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {experience.distanceMiles}mi
            </div>
          )}
          <div className="flex items-center gap-1 ml-auto" title={`Energy level: ${experience.energyLevel}`}>
            <div className={cn("w-2 h-2 rounded-full", getEnergyColor(experience.energyLevel))} />
            <span className="capitalize">{experience.energyLevel} energy</span>
          </div>
        </div>

        <div className="bg-secondary/50 rounded-lg p-3 text-sm text-secondary-foreground mb-6 flex-1 italic">
          "{experience.whyItFits}"
        </div>

        <div className="mt-auto flex items-center justify-between pt-4 border-t border-border">
          <p className="text-[10px] text-muted-foreground max-w-[50%] leading-tight">
            {experience.demoDataNote}
          </p>
          <Link 
            href={`/together/experiences/${experience.id}?action=invite`}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
          >
            Ask Them Out
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
