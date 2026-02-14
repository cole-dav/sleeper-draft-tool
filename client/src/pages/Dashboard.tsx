import { useParams, Link, useLocation } from "wouter";
import { useFetchLeague, useLeague, useSavePickPrediction, useUpdateLeagueTeamOrder, useUserLeagues } from "@/hooks/use-league";
import { PickCard } from "@/components/PickCard";
import { TeamNeedsCard } from "@/components/TeamNeedsCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, RefreshCw, Trophy, Calendar, Users, HelpCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { clearSleeperUser, getSleeperUser, setSleeperUser, type SleeperUser } from "@/lib/sleeperUser";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";

export default function Dashboard() {
  const params = useParams();
  const leagueId = params.id!;
  const [, setLocation] = useLocation();
  const { data, isLoading, error, refetch } = useLeague(leagueId);
  const [selectedSeasons, setSelectedSeasons] = useState<Set<string>>(new Set());
  const [draggedTeam, setDraggedTeam] = useState<number | null>(null);
  const [teamOrder, setTeamOrder] = useState<number[]>([]);
  const [editingPickId, setEditingPickId] = useState<number | null>(null);
  const [commentValue, setCommentValue] = useState("");
  const [selectedTeamRosterId, setSelectedTeamRosterId] = useState<number | null>(null);
  const [currentUser, setCurrentUser] = useState<SleeperUser | null>(() => getSleeperUser());
  const [loginUsername, setLoginUsername] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const userLeaguesQuery = useUserLeagues(currentUser?.userId ?? null);
  const fetchLeague = useFetchLeague();
  const [switchingLeagueId, setSwitchingLeagueId] = useState("");
  const [switchError, setSwitchError] = useState<string | null>(null);

  const savePredictionMutation = useSavePickPrediction(leagueId);

  const updateTeamOrderMutation = useUpdateLeagueTeamOrder();
  const teamOrderInitialized = useRef(false);

  useEffect(() => {
    if (!data?.picks?.length || selectedSeasons.size > 0) return;
    const allSeasons = Array.from(new Set(data.picks.map(p => p.season))).sort();
    setSelectedSeasons(new Set(allSeasons));
  }, [data, selectedSeasons.size]);

  useEffect(() => {
    if (!data?.rosters?.length || teamOrderInitialized.current) return;
    teamOrderInitialized.current = true;
    if (data.teamOrder?.length) {
      setTeamOrder(data.teamOrder);
    } else {
      const rosters = data.rosters;
      const picks = data.picks;
      const getRecordOrder = () => {
        const sortedRosters = [...rosters].sort((a, b) => {
          const aLosses = (a.settings as any)?.losses || 0;
          const bLosses = (b.settings as any)?.losses || 0;
          if (aLosses !== bLosses) return bLosses - aLosses;
          const aWins = (a.settings as any)?.wins || 0;
          const bWins = (b.settings as any)?.wins || 0;
          return aWins - bWins;
        });
        return sortedRosters.map(r => r.rosterId);
      };
      const getNextDraftOrder = () => {
        const rosterPositions = rosters.map(r => {
          const rawPosition = (r.settings as any)?.draft_position ?? (r.settings as any)?.draftPosition;
          const position = typeof rawPosition === "number" ? rawPosition : Number(rawPosition);
          return { rosterId: r.rosterId, position };
        });
        const hasAllPositions = rosterPositions.every(p => Number.isFinite(p.position));
        if (hasAllPositions) {
          return rosterPositions
            .sort((a, b) => (a.position as number) - (b.position as number))
            .map(p => p.rosterId);
        }

        const allSeasons = Array.from(new Set(picks.map(p => p.season)))
          .map(s => Number(s))
          .filter(n => Number.isFinite(n))
          .sort((a, b) => a - b);
        const nextDraftSeason = allSeasons[0] ? String(allSeasons[0]) : null;

        if (nextDraftSeason) {
          const roundOnePicks = picks.filter(p => p.season === nextDraftSeason && p.round === 1);
          const parsePickSlot = (slot: string | null) => {
            if (!slot) return null;
            const match = slot.match(/\d+(\.\d+)?/);
            return match ? Number(match[0]) : null;
          };
          const parsed = roundOnePicks.map(p => ({
            rosterId: p.rosterId,
            order: parsePickSlot(p.pickSlot)
          }));
          const hasAllPickSlots = parsed.length === rosters.length && parsed.every(p => Number.isFinite(p.order));
          if (hasAllPickSlots) {
            return parsed
              .sort((a, b) => (a.order as number) - (b.order as number))
              .map(p => p.rosterId);
          }
        }

        return getRecordOrder();
      };
      setTeamOrder(getNextDraftOrder());
    }
  }, [data]);

  useEffect(() => {
    teamOrderInitialized.current = false;
    setTeamOrder([]);
  }, [leagueId]);

  useEffect(() => {
    if (!savePredictionMutation.isSuccess) return;
    setEditingPickId(null);
    setCommentValue("");
    savePredictionMutation.reset();
  }, [savePredictionMutation.isSuccess]);

  const handleLogin = async () => {
    if (!loginUsername.trim()) return;
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const lookup = loginUsername.trim();
      const res = await fetch(`/api/sleeper/user/${encodeURIComponent(lookup)}`);
      if (!res.ok) {
        let msg = "User not found on Sleeper";
        try {
          const data = await res.json();
          if (data?.message) msg = data.message;
        } catch {}
        throw new Error(msg);
      }
      const user = await res.json();
      const payload: SleeperUser = {
        userId: user.userId,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
      };
      setSleeperUser(payload);
      setCurrentUser(payload);
      setLoginUsername("");
      setShowLoginPrompt(false);
      queryClient.invalidateQueries({ queryKey: [api.league.get.path, leagueId] });
    } catch (err: any) {
      setLoginError(err.message || "Failed to sign in");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    clearSleeperUser();
    setCurrentUser(null);
    setShowLoginPrompt(true);
  };

  const handleLeagueSwitch = async (nextId: string) => {
    if (!nextId || nextId === leagueId) return;
    setSwitchError(null);
    setSwitchingLeagueId(nextId);
    try {
      await fetchLeague.mutateAsync(nextId);
      setLocation(`/league/${nextId}`);
    } catch (err: any) {
      setSwitchError(err.message || "Failed to switch league");
    } finally {
      setSwitchingLeagueId("");
    }
  };

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
  const pickPredictions = data.pickPredictions ?? {};
  const teamPlayers = data.teamPlayers ?? {};

  const getRecordOrder = () => {
    // Sort rosters by record: losses (desc) then wins (asc)
    // Worst record to the left means most losses, then fewest wins
    const sortedRosters = [...rosters].sort((a, b) => {
      const aLosses = (a.settings as any)?.losses || 0;
      const bLosses = (b.settings as any)?.losses || 0;
      if (aLosses !== bLosses) return bLosses - aLosses;

      const aWins = (a.settings as any)?.wins || 0;
      const bWins = (b.settings as any)?.wins || 0;
      return aWins - bWins;
    });
    return sortedRosters.map(r => r.rosterId);
  };

  const getNextDraftOrder = () => {
    // Prefer explicit draft positions from the next draft, if available.
    const rosterPositions = rosters.map(r => {
      const rawPosition = (r.settings as any)?.draft_position ?? (r.settings as any)?.draftPosition;
      const position = typeof rawPosition === "number" ? rawPosition : Number(rawPosition);
      return { rosterId: r.rosterId, position };
    });
    const hasAllPositions = rosterPositions.every(p => Number.isFinite(p.position));
    if (hasAllPositions) {
      return rosterPositions
        .sort((a, b) => (a.position as number) - (b.position as number))
        .map(p => p.rosterId);
    }

    const allSeasons = Array.from(new Set(picks.map(p => p.season)))
      .map(s => Number(s))
      .filter(n => Number.isFinite(n))
      .sort((a, b) => a - b);
    const nextDraftSeason = allSeasons[0] ? String(allSeasons[0]) : null;

    if (nextDraftSeason) {
      const roundOnePicks = picks.filter(p => p.season === nextDraftSeason && p.round === 1);
      const parsePickSlot = (slot: string | null) => {
        if (!slot) return null;
        const match = slot.match(/\d+(\.\d+)?/);
        return match ? Number(match[0]) : null;
      };
      const parsed = roundOnePicks.map(p => ({
        rosterId: p.rosterId,
        order: parsePickSlot(p.pickSlot)
      }));
      const hasAllPickSlots = parsed.length === rosters.length && parsed.every(p => Number.isFinite(p.order));
      if (hasAllPickSlots) {
        return parsed
          .sort((a, b) => (a.order as number) - (b.order as number))
          .map(p => p.rosterId);
      }
    }

    return getRecordOrder();
  };

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
  const selectedRoster = selectedTeamRosterId ? getRosterById(selectedTeamRosterId) : null;
  const selectedUser = selectedRoster ? getUser(selectedRoster.ownerId || null) : null;
  const selectedNeeds = selectedRoster ? teamNeeds[selectedRoster.rosterId] || [] : [];
  const selectedPlayers = selectedRoster ? teamPlayers[selectedRoster.rosterId] || [] : [];

  // Extract unique seasons and filter out 2025, then sort
  const seasons = Array.from(new Set(picks.map(p => p.season)))
    .filter(season => season !== "2025")
    .sort();

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

    const newOrder = [...teamOrder];
    const draggedIndex = newOrder.indexOf(draggedTeam);
    const targetIndex = newOrder.indexOf(targetRosterId);
    [newOrder[draggedIndex], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[draggedIndex]];

    setTeamOrder(newOrder);
    setDraggedTeam(null);
    updateTeamOrderMutation.mutate({ leagueId, order: newOrder });
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
              {currentUser ? (
                <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground border border-white/10 rounded-full px-2 py-1">
                  {currentUser.avatar ? (
                    <img
                      src={`https://sleepercdn.com/avatars/thumbs/${currentUser.avatar}`}
                      alt={currentUser.displayName || currentUser.username}
                      className="w-4 h-4 rounded-full"
                    />
                  ) : null}
                  <span>Signed in as {currentUser.displayName || currentUser.username}</span>
                  <Button variant="ghost" size="sm" className="h-6 px-2" onClick={handleLogout}>
                    Switch
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setShowLoginPrompt(true)}>
                  Sign In
                </Button>
              )}
              {currentUser && (userLeaguesQuery.data?.length ?? 0) > 0 && (
                <div className="hidden md:flex items-center gap-2">
                  <select
                    value={leagueId}
                    onChange={(e) => handleLeagueSwitch(e.target.value)}
                    className="h-8 text-xs bg-background/60 border border-white/10 rounded-md px-2"
                    disabled={!!switchingLeagueId}
                  >
                    {userLeaguesQuery.data?.map((l) => (
                      <option key={l.leagueId} value={l.leagueId}>
                        {l.name} ({l.season})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-2 border-primary/20 hover:bg-primary/10 text-primary">
                <RefreshCw className="h-4 w-4" />
                Sync
              </Button>
            </div>
          </div>
          {switchError && (
            <div className="mt-2 text-xs text-destructive">{switchError}</div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
        {(!currentUser || showLoginPrompt) && (
          <section className="bg-secondary/30 border border-white/10 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center gap-3">
            <div className="flex-1">
              <div className="text-sm font-semibold">Sign in with Sleeper username</div>
              <div className="text-xs text-muted-foreground">
                Predictions are private to your username and won’t show for others.
              </div>
            </div>
            <div className="w-full md:w-auto flex items-center gap-2">
              <Input
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="Sleeper username"
                className="h-9 w-full md:w-56 bg-background/60 border-white/10"
              />
              <Button onClick={handleLogin} disabled={isLoggingIn || !loginUsername.trim()}>
                {isLoggingIn ? "Signing in..." : "Sign In"}
              </Button>
            </div>
            {loginError && (
              <div className="text-xs text-destructive">{loginError}</div>
            )}
          </section>
        )}
        
        {/* Team Needs Section */}
        <section className="animate-in" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-2 mb-6">
            <h2 className="text-xl font-bold text-white">Team Needs Analysis</h2>
            <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-bold border border-primary/20">FantasyCalc</span>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-white/5 p-0">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs p-4 bg-popover text-popover-foreground border shadow-md">
                <div className="space-y-2">
                  <p className="font-bold border-b pb-1">Calculation Logic</p>
                  <p className="text-xs leading-relaxed">
                    Team needs are calculated by analyzing each team's roster composition. We compare positional value totals (QB, RB, WR, TE) against league averages using FantasyCalc values.
                  </p>
                  <p className="text-xs italic text-muted-foreground">
                    *A higher score indicates a higher positional need. Values adapt to your league settings.
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {rosters.map((roster, i) => (
              <TeamNeedsCard 
                key={roster.id} 
                roster={roster}
                user={getUser(roster.ownerId)}
                needs={teamNeeds[roster.rosterId] || []}
                onClick={() => setSelectedTeamRosterId(roster.rosterId)}
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
                                    className={`p-3 text-center text-xs font-bold uppercase tracking-wider min-w-32 border-r border-white/5 last:border-r-0 cursor-move transition-all duration-200 group relative ${isDraggedTeam ? "opacity-50" : "opacity-100"} hover:bg-primary/5`}
                                  >
                                    <div className="flex flex-col items-center gap-1 relative z-10">
                                      <div className="relative">
                                        {teamUser?.avatar ? (
                                          <img 
                                            src={`https://sleepercdn.com/avatars/thumbs/${teamUser.avatar}`} 
                                            alt={teamUser.displayName}
                                            className="w-8 h-8 rounded-full ring-2 ring-transparent group-hover:ring-primary/50 transition-all duration-200"
                                          />
                                        ) : (
                                          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold group-hover:bg-primary/20 transition-colors">
                                            {teamUser?.displayName?.[0]}
                                          </div>
                                        )}
                                        <div className="absolute -inset-1 bg-primary/20 rounded-full blur opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                                      </div>
                                      <span className="text-[10px] text-muted-foreground group-hover:text-primary transition-colors duration-200">
                                        {teamUser?.displayName?.split(' ')[0] || 'Team'}
                                      </span>
                                    </div>
                                    <div className="absolute inset-x-0 bottom-0 h-0.5 bg-primary scale-x-0 group-hover:scale-x-100 transition-transform duration-200" />
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
                                    // The pick in this column belongs to the original owner (the team in the header)
                                    const pickForTeam = roundPicks.find(p => p.rosterId === team.rosterId);
                                    const currentPrediction = pickForTeam ? (pickPredictions[pickForTeam.id] || "") : "";
                                    const isTransferred = pickForTeam?.ownerId && pickForTeam.ownerId !== team.rosterId;
                                    const currentOwnerRoster = rosters.find(r => r.rosterId === pickForTeam?.ownerId);
                                    const currentOwner = isTransferred ? getUser(currentOwnerRoster?.ownerId || null) : null;
                                    
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
                                                ? "bg-accent/10 border-accent/30" 
                                                : "bg-secondary/40 border-white/5"}
                                              hover:border-white/20 hover:shadow-lg
                                            `}
                                          >
                                            <div className="space-y-1">
                                              <div className="font-mono text-[10px] text-muted-foreground">
                                                {season} R{round}
                                              </div>
                                              {isTransferred && currentOwner ? (
                                                <div className="text-[10px] text-accent-foreground font-medium">
                                                  owned by {currentOwner.displayName?.split(' ')[0]}
                                                </div>
                                              ) : (
                                                <div className="text-[10px] text-muted-foreground/60">
                                                  Original Pick
                                                </div>
                                              )}
                                              
                                              <div 
                                                className="mt-2 min-h-[1.5rem] flex items-center justify-center cursor-text"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (!currentUser) {
                                                    setShowLoginPrompt(true);
                                                    return;
                                                  }
                                                  setEditingPickId(pickForTeam.id);
                                                  setCommentValue(currentPrediction);
                                                }}
                                              >
                                                {editingPickId === pickForTeam.id ? (
                                                  <Input
                                                    autoFocus
                                                    value={commentValue}
                                                    onChange={(e) => setCommentValue(e.target.value)}
                                                    placeholder="Prediction..."
                                                    className="h-6 text-[10px] py-0 px-1 bg-background/50 border-white/10"
                                                    onKeyDown={(e) => {
                                                      if (e.key === 'Enter') {
                                                        if (commentValue !== currentPrediction) {
                                                          savePredictionMutation.mutate({ id: pickForTeam.id, comment: commentValue });
                                                        } else {
                                                          setEditingPickId(null);
                                                        }
                                                      } else if (e.key === 'Escape') {
                                                        setEditingPickId(null);
                                                      }
                                                    }}
                                                    onBlur={() => {
                                                      if (commentValue !== currentPrediction) {
                                                        savePredictionMutation.mutate({ id: pickForTeam.id, comment: commentValue });
                                                      } else {
                                                        setEditingPickId(null);
                                                      }
                                                    }}
                                                  />
                                                ) : (
                                                  <div className={`text-[10px] italic ${currentPrediction ? 'text-primary' : 'text-muted-foreground/30'}`}>
                                                    {currentPrediction || "Click to predict..."}
                                                  </div>
                                                )}
                                              </div>
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

      <Dialog
        open={!!selectedTeamRosterId}
        onOpenChange={(open) => {
          if (!open) setSelectedTeamRosterId(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Team Details</DialogTitle>
            <DialogDescription>
              Full roster view and complete positional needs.
            </DialogDescription>
          </DialogHeader>

          {selectedRoster && (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                {selectedUser?.avatar ? (
                  <img
                    src={`https://sleepercdn.com/avatars/thumbs/${selectedUser.avatar}`}
                    alt={selectedUser.displayName}
                    className="w-12 h-12 rounded-xl bg-secondary object-cover ring-2 ring-white/10"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-sm font-bold">
                    {selectedUser?.displayName?.charAt(0) || "T"}
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-foreground truncate">
                    {selectedUser?.displayName || `Roster ${selectedRoster.rosterId}`}
                  </h3>
                  <div className="text-xs text-muted-foreground font-mono">
                    #{selectedRoster.rosterId}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    Record{" "}
                    <span className="text-foreground font-semibold">
                      {(selectedRoster.settings as any)?.wins ?? 0}-
                      {(selectedRoster.settings as any)?.losses ?? 0}
                    </span>
                  </span>
                  <span>
                    PF{" "}
                    <span className="text-foreground font-semibold">
                      {(selectedRoster.settings as any)?.fpts ?? 0}
                    </span>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-foreground">Positional Needs</h4>
                  <div className="space-y-2">
                    {selectedNeeds.map((need) => (
                      <div key={need.position} className="flex items-center justify-between gap-3">
                        <span className="text-xs font-bold text-muted-foreground w-8">
                          {need.position}
                        </span>
                        <div className="flex-1 h-2 bg-secondary/50 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              need.score > 70
                                ? "bg-destructive"
                                : need.score > 40
                                  ? "bg-yellow-500"
                                  : "bg-primary"
                            }`}
                            style={{ width: `${need.score}%` }}
                          />
                        </div>
                        <span
                          className={`text-[10px] font-mono font-bold w-6 text-right ${
                            need.score > 70
                              ? "text-destructive"
                              : need.score > 40
                                ? "text-yellow-500"
                                : "text-primary"
                          }`}
                        >
                          {Math.round(need.score)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-foreground">Full Roster</h4>
                  <div className="max-h-80 overflow-auto rounded-lg border border-white/10 bg-card/40">
                    {selectedPlayers.length === 0 ? (
                      <div className="p-4 text-xs text-muted-foreground">
                        Player list not available. Click Sync to pull roster players.
                      </div>
                    ) : (
                      <div className="divide-y divide-white/5">
                        {selectedPlayers.map((player) => (
                          <div key={player.id} className="flex items-center gap-3 px-4 py-2">
                            <span className="w-8 text-xs font-bold text-muted-foreground">
                              {player.position}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-foreground truncate">
                                {player.name}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {player.team || "FA"}
                              </div>
                            </div>
                            {player.isStarter && (
                              <Badge variant="secondary" className="text-[10px]">Starter</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
