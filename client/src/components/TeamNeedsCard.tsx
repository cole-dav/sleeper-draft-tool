import { User, Roster } from "@shared/schema";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface TeamNeedsCardProps {
  needs: { position: string; score: number }[];
  user?: User;
  roster: Roster;
  onClick?: () => void;
}

export function TeamNeedsCard({ needs, user, roster, onClick }: TeamNeedsCardProps) {
  // Sort needs by score descending (highest need first)
  const sortedNeeds = [...needs].sort((a, b) => b.score - a.score);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`bg-card/40 backdrop-blur-sm border border-white/5 rounded-lg p-3 transition-colors ${
        onClick ? "cursor-pointer hover:border-white/10 hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" : ""
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        {user?.avatar ? (
          <img 
            src={`https://sleepercdn.com/avatars/thumbs/${user.avatar}`} 
            alt={user.displayName} 
            className="w-7 h-7 rounded-full bg-secondary ring-1 ring-white/5"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs font-bold">
            {user?.displayName?.charAt(0) || "T"}
          </div>
        )}
        <div className="overflow-hidden">
          <h3 className="font-display font-bold text-sm truncate text-foreground">
            {user?.displayName || `Roster ${roster.rosterId}`}
          </h3>
          <p className="text-[10px] text-muted-foreground font-mono">
            #{roster.rosterId}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {sortedNeeds.slice(0, 4).map((need) => (
          <div key={need.position} className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-muted-foreground w-5">
              {need.position}
            </span>
            <div className="flex-1 h-1.5 bg-secondary/50 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all ${
                  need.score > 70 ? "bg-destructive" : 
                  need.score > 40 ? "bg-yellow-500" : "bg-primary"
                }`}
                style={{ width: `${need.score}%` }}
              />
            </div>
            <span className={`text-[9px] font-mono font-bold w-4 text-right ${
               need.score > 70 ? "text-destructive" : 
               need.score > 40 ? "text-yellow-500" : "text-primary"
            }`}>
              {Math.round(need.score)}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
