import { useParams, Link } from "wouter";
import { useLeague } from "@/hooks/use-league";
import { PickCard } from "@/components/PickCard";
import { TeamNeedsCard } from "@/components/TeamNeedsCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, RefreshCw, Trophy, Calendar, Users } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

export default function Dashboard() {
  const params = useParams();
  const leagueId = params.id!;
  const { data, isLoading, error, refetch } = useLeague(leagueId);
  const [selectedSeasons, setSelectedSeasons] = useState<Set<string>>(new Set());
  const [draggedTeam, setDraggedTeam] = useState<number | null>(null);
  const [teamOrder, setTeamOrder] = useState<number[]>([]);

  if (isLoading) return <DashboardSkeleton />;

  if (error || !data) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-2xl font-bold font-display text-destructive">League Not Found</h2>
        <p className="text-muted-foreground">Could not load league data. It might not be synced yet.</p>
        <Link href="/">
          <Button variant="secondary" className="w-full">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
          </Button>
        </Link>
      </div>
    </div>
  );

  const { league, rosters, users, picks, teamNeeds } = data;

  // Initialize selectedSeasons and teamOrder on first load
  if (selectedSeasons.size === 0) {
    const allSeasons = Array.from(new Set(picks.map(p => p.season))).sort();
    setSelectedSeasons(new Set(allSeasons));
  }

  if (teamOrder.length === 0 && rosters.length > 0) {
    setTeamOrder(rosters.map(r => r.rosterId));
  }
  
  const toggleSeason = (season: string) => {
    const newSeasons = new Set(selectedSeasons);
    if (newSeasons.has(season)) {
      newSeasons.delete(season);
    } else {
      newSeasons.add(season);
    }
    setSelectedSeasons(newSeasons);
  };

  // Helper to find user for roster
  const getUser = (ownerId: string | null) => users.find(u => u.userId === ownerId);
  const getRosterById = (rosterId: number) => rosters.find(r => r.rosterId === rosterId);
  const getUserByRosterId = (rosterId: number) => getUser(getRosterById(rosterId)?.ownerId || null);

  // Extract unique seasons and sort
  const seasons = Array.from(new Set(picks.map(p => p.season))).sort();

  // Get teams in the current display order (considering swaps)
  const teamsInOrder = teamOrder.map(rosterId => rosters.find(r => r.rosterId === rosterId)!).filter(Boolean);

  // Organize picks by season -> round -> picks (sorted by ownerId/position in round)
  const picksBySeasonAndRound = new Map<string, Map<number, typeof picks>>();
  
  seasons.forEach(season => {
    const roundMap = new Map<number, typeof picks>();
    const seasonPicks = picks.filter(p => p.season === season);
    const rounds = Array.from(new Set(seasonPicks.map(p => p.round))).sort((a, b) => a - b);
    
    rounds.forEach(round => {
      const roundPicks = seasonPicks
        .filter(p => p.round === round)
        .sort((a, b) => a.ownerId - b.ownerId); // Sort by current owner roster ID
      roundMap.set(round, roundPicks);
    });
    
    picksBySeasonAndRound.set(season, roundMap);
  });

  const handleTeamDragStart = (teamRosterId: number, e: React.DragEvent) => {
    setDraggedTeam(teamRosterId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleTeamDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleTeamDrop = (targetRosterId: number, e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedTeam || draggedTeam === targetRosterId) {
      setDraggedTeam(null);
      return;
    }

    // Swap team positions
    const newOrder = [...teamOrder];
    const draggedIndex = newOrder.indexOf(draggedTeam);
    const targetIndex = newOrder.indexOf(targetRosterId);

    [newOrder[draggedIndex], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[draggedIndex]];

    setTeamOrder(newOrder);
    setDraggedTeam(null);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/5">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              {league.avatar && (
                <img 
                  src={`https://sleepercdn.com/avatars/thumbs/${league.avatar}`} 
                  alt="League Avatar" 
                  className="w-12 h-12 rounded-xl bg-secondary object-cover ring-2 ring-white/10"
                />
              )}
              <div>
                <h1 className="text-xl md:text-2xl font-bold font-display tracking-tight text-white">
                  {league.name}
                </h1>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Trophy className="w-3 h-3" /> Season {league.season}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" /> {league.totalRosters} Teams
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-2 border-primary/20 hover:bg-primary/10 text-primary">
                <RefreshCw className="h-4 w-4" />
                Sync
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
        
        {/* Team Needs Section */}
        <section className="animate-in" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-2 mb-6">
            <h2 className="text-xl font-bold text-white">Team Needs Analysis</h2>
            <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-bold border border-primary/20">KTC Data</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {rosters.map((roster, i) => (
              <TeamNeedsCard 
                key={roster.id} 
                roster={roster}
                user={getUser(roster.ownerId)}
                needs={teamNeeds[roster.rosterId] || []}
              />
            ))}
          </div>
        </section>

        {/* Draft Board View */}
        <section className="animate-in" style={{ animationDelay: '0.2s' }}>
          <div className="space-y-6">
            {seasons.map(season => {
              const roundMap = picksBySeasonAndRound.get(season);
              const rounds = Array.from(roundMap?.keys() || []).sort((a, b) => a - b);
              
              return (
                <div key={season} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary" />
                      {season} Draft
                    </h3>
                    <Button
                      onClick={() => toggleSeason(season)}
                      variant={selectedSeasons.has(season) ? "default" : "outline"}
                      size="sm"
                      className="font-mono"
                    >
                      {season}
                    </Button>
                  </div>
                  
                  {selectedSeasons.has(season) && (
                    <div className="bg-card/30 border border-white/5 rounded-xl overflow-x-auto">
                      <div className="inline-block min-w-full">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-secondary/50 border-b border-white/5">
                              <th className="p-3 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider w-20 sticky left-0 bg-card z-10">Round</th>
                              {teamsInOrder.map((team) => {
                                const teamUser = getUser(team.ownerId);
                                const isDraggedTeam = draggedTeam === team.rosterId;
                                return (
                                  <th 
                                    key={team.rosterId} 
                                    draggable
                                    onDragStart={(e) => handleTeamDragStart(team.rosterId, e)}
                                    onDragOver={handleTeamDragOver}
                                    onDrop={(e) => handleTeamDrop(team.rosterId, e)}
                                    className={`p-3 text-center text-xs font-bold uppercase tracking-wider min-w-32 border-r border-white/5 last:border-r-0 cursor-move transition-opacity ${isDraggedTeam ? "opacity-50" : "opacity-100"}`}
                                  >
                                    <div className="flex flex-col items-center gap-1">
                                      {teamUser?.avatar ? (
                                        <img 
                                          src={`https://sleepercdn.com/avatars/thumbs/${teamUser.avatar}`} 
                                          alt={teamUser.displayName}
                                          className="w-6 h-6 rounded-full"
                                        />
                                      ) : (
                                        <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs font-bold">
                                          {teamUser?.displayName?.[0]}
                                        </div>
                                      )}
                                      <span className="text-[10px] text-muted-foreground">{teamUser?.displayName?.split(' ')[0] || 'Team'}</span>
                                    </div>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {rounds.map(round => {
                              const roundPicks = roundMap?.get(round) || [];
                              
                              return (
                                <tr key={`${season}-r${round}`} className="hover:bg-white/[0.02] transition-colors">
                                  <td className="p-3 sticky left-0 bg-card hover:bg-card/95 transition-colors border-r border-white/5 z-10 font-bold text-sm text-foreground font-mono">
                                    Rd {round}
                                  </td>
                                  {teamsInOrder.map((team) => {
                                    const pickForTeam = roundPicks.find(p => p.ownerId === team.rosterId);
                                    const isTransferred = pickForTeam?.previousOwnerId && pickForTeam.previousOwnerId !== pickForTeam.ownerId;
                                    const originalOwner = isTransferred ? getUser(rosters.find(r => r.rosterId === pickForTeam.rosterId)?.ownerId || null) : null;
                                    
                                    return (
                                      <td 
                                        key={`${round}-team${team.rosterId}`} 
                                        className="p-2 text-center align-top border-r border-white/5 last:border-r-0 min-h-24"
                                      >
                                        {pickForTeam ? (
                                          <div 
                                            className={`
                                              p-2 rounded-lg border transition-all text-xs
                                              ${isTransferred
                                                ? "bg-accent/15 border-accent/40" 
                                                : "bg-secondary/40 border-white/5"}
                                              hover:border-white/20 hover:shadow-lg
                                            `}
                                          >
                                            <div className="space-y-1">
                                              <div className="font-mono text-[10px] text-muted-foreground">
                                                {season} R{round}
                                              </div>
                                              {isTransferred && originalOwner && (
                                                <div className="text-[10px] text-accent-foreground/80">
                                                  from {originalOwner.displayName?.split(' ')[0]}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="h-8 flex items-center justify-center text-xs text-muted-foreground/30">
                                            -
                                          </div>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

      </main>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background p-4 space-y-8">
      <div className="h-20 max-w-7xl mx-auto flex items-center gap-4">
        <Skeleton className="w-12 h-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
      </div>
      <div className="max-w-7xl mx-auto space-y-4">
        <Skeleton className="h-10 w-full" />
        {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    </div>
  );
}
