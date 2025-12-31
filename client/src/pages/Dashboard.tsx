import { useParams, Link } from "wouter";
import { useLeague } from "@/hooks/use-league";
import { PickCard } from "@/components/PickCard";
import { TeamNeedsCard } from "@/components/TeamNeedsCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, RefreshCw, Trophy, Calendar, Users, Grid, List } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

export default function Dashboard() {
  const params = useParams();
  const leagueId = params.id!;
  const { data, isLoading, error, refetch } = useLeague(leagueId);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

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

  // Helper to find user for roster
  const getUser = (ownerId: string | null) => users.find(u => u.userId === ownerId);
  const getRosterName = (roster: typeof rosters[0]) => {
    const user = getUser(roster.ownerId);
    return user?.displayName || `Roster ${roster.rosterId}`;
  };

  // Organize picks: rosterId -> season -> picks[]
  const picksMap = new Map<number, Map<string, typeof picks>>();
  
  rosters.forEach(r => {
    picksMap.set(r.rosterId, new Map());
  });

  picks.forEach(pick => {
    const ownerPicks = picksMap.get(pick.ownerId);
    if (ownerPicks) {
      if (!ownerPicks.has(pick.season)) {
        ownerPicks.set(pick.season, []);
      }
      ownerPicks.get(pick.season)!.push(pick);
    }
  });

  // Extract unique seasons and sort
  const seasons = Array.from(new Set(picks.map(p => p.season))).sort();

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
              <div className="bg-secondary/30 p-1 rounded-lg flex mr-2">
                <Button 
                  variant={viewMode === 'grid' ? "secondary" : "ghost"} 
                  size="sm" 
                  onClick={() => setViewMode('grid')}
                  className="h-8 w-8 p-0"
                >
                  <Grid className="w-4 h-4" />
                </Button>
                <Button 
                  variant={viewMode === 'list' ? "secondary" : "ghost"} 
                  size="sm" 
                  onClick={() => setViewMode('list')}
                  className="h-8 w-8 p-0"
                >
                  <List className="w-4 h-4" />
                </Button>
              </div>
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

        {/* Draft Picks Matrix */}
        <section className="animate-in" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Draft Capital Matrix</h2>
            <div className="flex gap-2">
              {seasons.map(season => (
                <span key={season} className="px-3 py-1 rounded-full bg-secondary/50 text-xs font-mono text-muted-foreground border border-white/5">
                  {season}
                </span>
              ))}
            </div>
          </div>
          
          <div className="bg-card/30 border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
            {viewMode === 'grid' ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="bg-secondary/50 border-b border-white/5">
                      <th className="p-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider w-[200px] sticky left-0 bg-card z-10">Team</th>
                      {seasons.map(season => (
                        <th key={season} className="p-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider min-w-[200px]">
                          {season} Picks
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {rosters.map((roster) => {
                      const user = getUser(roster.ownerId);
                      return (
                        <tr key={roster.id} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="p-4 sticky left-0 bg-card group-hover:bg-card/95 transition-colors border-r border-white/5 z-10">
                            <div className="flex items-center gap-3">
                              {user?.avatar ? (
                                <img src={`https://sleepercdn.com/avatars/thumbs/${user.avatar}`} className="w-8 h-8 rounded-full" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold">{user?.displayName?.[0]}</div>
                              )}
                              <div className="truncate max-w-[140px]">
                                <div className="font-medium text-sm text-foreground truncate">{user?.displayName || "Unknown"}</div>
                                <div className="text-xs text-muted-foreground font-mono">#{roster.rosterId}</div>
                              </div>
                            </div>
                          </td>
                          {seasons.map(season => {
                            const rosterPicks = picksMap.get(roster.rosterId)?.get(season) || [];
                            return (
                              <td key={`${roster.id}-${season}`} className="p-4 align-top">
                                <div className="grid gap-2">
                                  {rosterPicks.length > 0 ? (
                                    rosterPicks.sort((a,b) => a.round - b.round).map(pick => {
                                      const originalRoster = rosters.find(r => r.rosterId === pick.rosterId);
                                      const originalOwner = getUser(originalRoster?.ownerId)?.displayName;
                                      return (
                                        <PickCard 
                                          key={pick.id} 
                                          pick={pick} 
                                          originalOwnerName={originalOwner}
                                        />
                                      );
                                    })
                                  ) : (
                                    <div className="h-8 flex items-center text-xs text-muted-foreground/30 font-mono pl-2 border-l-2 border-white/5">
                                      -
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center text-muted-foreground">
                List view coming soon.
              </div>
            )}
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
