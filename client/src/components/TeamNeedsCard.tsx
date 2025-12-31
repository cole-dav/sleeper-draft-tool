import { User, Roster } from "@shared/schema";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface TeamNeedsCardProps {
  needs: { position: string; score: number }[];
  user?: User;
  roster: Roster;
}

export function TeamNeedsCard({ needs, user, roster }: TeamNeedsCardProps) {
  // Sort needs by score descending (highest need first)
  const sortedNeeds = [...needs].sort((a, b) => b.score - a.score);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card/50 backdrop-blur-sm border border-white/5 rounded-xl p-5 hover:border-white/10 transition-colors"
    >
      <div className="flex items-center gap-3 mb-4">
        {user?.avatar ? (
          <img 
            src={`https://sleepercdn.com/avatars/thumbs/${user.avatar}`} 
            alt={user.displayName} 
            className="w-10 h-10 rounded-full bg-secondary ring-2 ring-white/5"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-lg font-bold">
            {user?.displayName?.charAt(0) || "T"}
          </div>
        )}
        <div className="overflow-hidden">
          <h3 className="font-display font-bold text-lg truncate text-foreground">
            {user?.displayName || `Roster ${roster.rosterId}`}
          </h3>
          <p className="text-xs text-muted-foreground font-mono">
            Roster #{roster.rosterId}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {sortedNeeds.slice(0, 4).map((need) => (
          <div key={need.position} className="flex items-center justify-between group">
            <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
              {need.position}
            </span>
            <div className="flex items-center gap-2">
              <div className="h-2 w-24 bg-secondary rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${
                    need.score > 7 ? "bg-destructive" : 
                    need.score > 4 ? "bg-yellow-500" : "bg-primary"
                  }`}
                  style={{ width: `${Math.min(need.score * 10, 100)}%` }}
                />
              </div>
              <span className={`text-xs font-mono font-bold w-4 text-right ${
                 need.score > 7 ? "text-destructive" : 
                 need.score > 4 ? "text-yellow-500" : "text-primary"
              }`}>
                {need.score}
              </span>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
