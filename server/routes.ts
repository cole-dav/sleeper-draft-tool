import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { type InsertDraftPick } from "@shared/schema";

type PlayerMeta = {
  id: string;
  fullName: string;
  position: string | null;
  team: string | null;
  fantasyPositions: string[];
};

const POSITIONS = ["QB", "RB", "WR", "TE"];
const PLAYER_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cachedPlayers: { fetchedAt: number; map: Map<string, PlayerMeta> } | null = null;

type FantasyCalcValue = {
  player: {
    sleeperId: string | number | null;
    position: string | null;
  };
  value: number;
};

const FANTASY_CALC_CACHE_TTL_MS = 60 * 60 * 1000;
const fantasyCalcCache = new Map<string, { fetchedAt: number; map: Map<string, number> }>();

function getRosterPositions(settings: any): string[] {
  const positions = settings?.roster_positions ?? settings?.rosterPositions ?? [];
  return Array.isArray(positions) ? positions.map(String) : [];
}

function resolveNumQbs(settings: any): number {
  const positions = getRosterPositions(settings);
  const qbSlots = positions.filter((p) => p === "QB").length;
  const hasSuperFlex = positions.some((p) => ["SF", "SUPER_FLEX", "SUPERFLEX", "OP"].includes(p));
  return qbSlots >= 2 || hasSuperFlex ? 2 : 1;
}

function resolvePpr(settings: any): number {
  const scoring = settings?.scoringSettings ?? settings?.scoring_settings ?? settings?.scoring ?? {};
  const candidate = scoring?.rec ?? scoring?.recp ?? scoring?.ppr ?? settings?.ppr;
  return Number.isFinite(Number(candidate)) ? Number(candidate) : 1;
}

async function getFantasyCalcValues(params: { isDynasty: boolean; numQbs: number; numTeams: number; ppr: number }) {
  const key = JSON.stringify(params);
  const now = Date.now();
  const cached = fantasyCalcCache.get(key);
  if (cached && now - cached.fetchedAt < FANTASY_CALC_CACHE_TTL_MS) {
    return cached.map;
  }

  const url = new URL("https://api.fantasycalc.com/values/current");
  url.searchParams.set("isDynasty", String(params.isDynasty));
  url.searchParams.set("numQbs", String(params.numQbs));
  url.searchParams.set("numTeams", String(params.numTeams));
  url.searchParams.set("ppr", String(params.ppr));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to fetch FantasyCalc values");
  const data = (await res.json()) as FantasyCalcValue[];

  const map = new Map<string, number>();
  (Array.isArray(data) ? data : []).forEach((entry) => {
    const sleeperId = entry?.player?.sleeperId;
    const value = entry?.value;
    if (sleeperId == null || !Number.isFinite(Number(value))) return;
    map.set(String(sleeperId), Number(value));
  });

  fantasyCalcCache.set(key, { fetchedAt: now, map });
  return map;
}

async function getSleeperPlayersMap(): Promise<Map<string, PlayerMeta>> {
  const now = Date.now();
  if (cachedPlayers && now - cachedPlayers.fetchedAt < PLAYER_CACHE_TTL_MS) {
    return cachedPlayers.map;
  }

  const res = await fetch("https://api.sleeper.app/v1/players/nfl");
  if (!res.ok) throw new Error("Failed to fetch Sleeper players");
  const data = await res.json();

  const map = new Map<string, PlayerMeta>();
  Object.values(data || {}).forEach((p: any) => {
    const id = String(p.player_id ?? "");
    if (!id) return;
    const fullName = String(p.full_name || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()).trim();
    const position = (p.position || p.fantasy_positions?.[0] || null) as string | null;
    map.set(id, {
      id,
      fullName: fullName || id,
      position,
      team: p.team ?? null,
      fantasyPositions: Array.isArray(p.fantasy_positions) ? p.fantasy_positions : [],
    });
  });

  cachedPlayers = { fetchedAt: now, map };
  return map;
}

function getRosterPlayerIds(roster: any): string[] {
  const settings = roster?.settings as any;
  const players = Array.isArray(settings?.players) ? settings.players : Array.isArray(roster?.players) ? roster.players : [];
  return players.map((p: any) => String(p));
}

function hashStringToInt(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

function deterministicScore(seed: string): number {
  return hashStringToInt(seed) % 101;
}

function strengthToNeedScore(strength: number, avg: number): number {
  const safeAvg = Math.max(avg, 1);
  const ratio = strength / safeAvg;
  const score = 50 + (1 - ratio) * 50;
  return Math.max(0, Math.min(100, score));
}

function computeRosterStrengths(
  rosters: any[],
  playersMap: Map<string, PlayerMeta> | null,
  valueBySleeperId?: Map<string, number> | null,
) {
  if (!playersMap) return null;

  const strengthsByRoster: Record<number, Record<string, number>> = {};
  const leagueTotals: Record<string, number> = Object.fromEntries(POSITIONS.map((pos) => [pos, 0]));

  for (const roster of rosters) {
    const rosterStrengths: Record<string, number> = Object.fromEntries(POSITIONS.map((pos) => [pos, 0]));
    const playerIds = getRosterPlayerIds(roster);
    for (const playerId of playerIds) {
      const player = playersMap.get(playerId);
      if (!player) continue;
      const position = player.position ?? player.fantasyPositions?.[0];
      if (!position || !POSITIONS.includes(position)) continue;
      const value = valueBySleeperId?.get(player.id) ?? 1;
      rosterStrengths[position] += value;
    }
    strengthsByRoster[roster.rosterId] = rosterStrengths;
    for (const pos of POSITIONS) {
      leagueTotals[pos] += rosterStrengths[pos];
    }
  }

  const rosterCount = Math.max(rosters.length, 1);
  const leagueAverages: Record<string, number> = Object.fromEntries(
    POSITIONS.map((pos) => [pos, leagueTotals[pos] / rosterCount])
  );

  return { strengthsByRoster, leagueAverages };
}

function fallbackTeamNeeds(roster: any) {
  const settings = roster?.settings as any;
  const wins = Number(settings?.wins ?? 0);
  const losses = Number(settings?.losses ?? 0);
  const fpts = Number(settings?.fpts ?? 0);
  const seedBase = `${roster?.rosterId ?? "0"}:${wins}:${losses}:${fpts}`;

  return POSITIONS.map((pos) => ({
    position: pos,
    score: deterministicScore(`${seedBase}:${pos}`),
  })).sort((a, b) => b.score - a.score);
}

function calculateTeamNeeds(
  roster: any,
  strengthsByRoster?: Record<number, Record<string, number>>,
  leagueAverages?: Record<string, number>,
) {
  if (!strengthsByRoster || !leagueAverages) return fallbackTeamNeeds(roster);
  const rosterStrengths = strengthsByRoster[roster.rosterId];
  if (!rosterStrengths) return fallbackTeamNeeds(roster);

  return POSITIONS.map((pos) => ({
    position: pos,
    score: strengthToNeedScore(rosterStrengths[pos] ?? 0, leagueAverages[pos] ?? 0),
  })).sort((a, b) => b.score - a.score);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // LOOKUP Sleeper User
  app.get(api.user.lookup.path, async (req, res) => {
    const username = req.params.username;
    try {
      const userRes = await fetch(`https://api.sleeper.app/v1/user/${encodeURIComponent(username)}`);
      if (!userRes.ok) return res.status(404).json({ message: "User not found" });
      const user = await userRes.json();
      res.json({
        userId: user.user_id,
        username: user.username,
        displayName: user.display_name,
        avatar: user.avatar,
      });
    } catch (err: any) {
      console.error("Error fetching sleeper user:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // FETCH League Data
  app.post(api.league.fetch.path, async (req, res) => {
    const leagueId = req.params.id;
    if (!leagueId) return res.status(400).json({ message: "Missing league ID" });

    try {
      console.log(`Fetching data for league ${leagueId}...`);
      
      // 1. Fetch League Info
      const leagueRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`);
      if (!leagueRes.ok) throw new Error("League not found");
      const leagueData = await leagueRes.json();
      
      await storage.upsertLeague({
        leagueId: leagueData.league_id,
        name: leagueData.name,
        totalRosters: leagueData.total_rosters,
        season: leagueData.season,
        avatar: leagueData.avatar,
        settings: {
          ...(leagueData.settings ?? {}),
          roster_positions: leagueData.roster_positions ?? [],
          scoring_settings: leagueData.scoring_settings ?? {},
        },
      });

      // 2. Fetch Users
      const usersRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
      const usersData = await usersRes.json();
      const usersList = usersData.map((u: any) => ({
        userId: u.user_id,
        leagueId: leagueId,
        displayName: u.display_name,
        avatar: u.avatar
      }));
      await storage.upsertUsers(usersList);

      // 3. Fetch Rosters
      const rostersRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
      const rostersData = await rostersRes.json();
      const rostersList = rostersData.map((r: any) => ({
        leagueId: leagueId,
        rosterId: r.roster_id,
        ownerId: r.owner_id,
        settings: {
          ...(r.settings ?? {}),
          players: r.players ?? [],
          starters: r.starters ?? [],
          taxi: r.taxi ?? [],
          reserve: r.reserve ?? [],
        }
      }));
      await storage.upsertRosters(rostersList);

      // 4. Generate & Resolve Picks
      // Fetch traded picks
      const tradedRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`);
      const tradedPicks = await tradedRes.json();

      const existingPicks = await storage.getPicks(leagueId);
      const existingComments = new Map<string, string | null>();
      for (const pick of existingPicks) {
        existingComments.set(`${pick.season}|${pick.round}|${pick.rosterId}`, pick.comment ?? null);
      }

      await storage.clearPicks(leagueId);

      const currentSeason = parseInt(leagueData.season);
      const rounds = leagueData.settings.draft_rounds || 3;
      const numTeams = rostersData.length;
      const seasonDraftOrder: Record<string, Record<number, number[]>> = {};
      try {
        const draftsRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/drafts`);
        const draftsRaw = await draftsRes.json();
        const draftsList = Array.isArray(draftsRaw) ? draftsRaw : [];
        for (const d of draftsList) {
          const draftId = d.draft_id;
          const season = String(d.season || "");
          if (!season || parseInt(season, 10) < currentSeason) continue;
          const draftRes = await fetch(`https://api.sleeper.app/v1/draft/${draftId}`);
          if (!draftRes.ok) continue;
          const draft = await draftRes.json();
          const slotToRoster = draft.slot_to_roster_id || {};
          const isSnake = (draft.type || "").toLowerCase() === "snake";
          const round1Order: number[] = [];
          for (let s = 1; s <= numTeams; s++) {
            const rid = slotToRoster[String(s)];
            if (rid != null) round1Order.push(Number(rid));
          }
          if (round1Order.length !== numTeams) continue;
          for (let r = 1; r <= rounds; r++) {
            seasonDraftOrder[season] = seasonDraftOrder[season] || {};
            seasonDraftOrder[season][r] = r === 1 || !isSnake ? [...round1Order] : [...round1Order].reverse();
          }
        }
      } catch (_) { /* non-fatal */ }

      const picksToInsert: InsertDraftPick[] = [];
      for (let year = currentSeason; year < currentSeason + 3; year++) {
        const seasonStr = String(year);
        const draftOrder = seasonDraftOrder[seasonStr];
        for (let round = 1; round <= rounds; round++) {
          const roundOrder = draftOrder?.[round];
          for (const roster of rostersData) {
            const traded = tradedPicks.find((tp: any) =>
              tp.season === seasonStr && tp.round === round && tp.roster_id === roster.roster_id
            );
            let pickSlot: string | null = null;
            if (roundOrder) {
              const pos = roundOrder.indexOf(roster.roster_id);
              if (pos >= 0) pickSlot = `${round}.${String(pos + 1).padStart(2, "0")}`;
            }
            const existingComment = existingComments.get(`${seasonStr}|${round}|${roster.roster_id}`) ?? null;
            picksToInsert.push({
              leagueId: leagueId,
              season: seasonStr,
              round: round,
              rosterId: roster.roster_id,
              ownerId: traded ? traded.owner_id : roster.roster_id,
              previousOwnerId: traded ? traded.previous_owner_id : null,
              pickSlot,
              comment: existingComment,
            });
          }
        }
      }
      await storage.upsertPicks(picksToInsert);

      res.json({ success: true });
    } catch (e: any) {
      console.error("Error fetching sleeper data:", e);
      res.status(500).json({ message: e.message });
    }
  });

  // GET League Data
  app.get(api.league.get.path, async (req, res) => {
    const leagueId = req.params.id;
    const league = await storage.getLeague(leagueId);
    if (!league) return res.status(404).json({ message: "League not found" });

    const rosters = await storage.getRosters(leagueId);
    const users = await storage.getUsers(leagueId);
    const picks = await storage.getPicks(leagueId);
    const userId = req.header("x-sleeper-user-id");
    const pickPredictions = userId ? await storage.getPickPredictions(leagueId, userId) : undefined;

    const hasPlayers = rosters.some((r) => Array.isArray((r.settings as any)?.players) && (r.settings as any).players.length > 0);
    const playersMap = hasPlayers ? await getSleeperPlayersMap() : null;
    let fantasyValues: Map<string, number> | null = null;
    if (playersMap) {
      try {
        const settings = league.settings as any;
        fantasyValues = await getFantasyCalcValues({
          isDynasty: true,
          numQbs: resolveNumQbs(settings),
          numTeams: Number(league.totalRosters) || 12,
          ppr: resolvePpr(settings),
        });
      } catch (err) {
        console.warn("FantasyCalc fetch failed; falling back to roster counts.", err);
      }
    }
    const strengthData = computeRosterStrengths(rosters, playersMap, fantasyValues);

    // Calculate Team Needs
    const teamNeeds: Record<number, any> = {};
    rosters.forEach((r) => {
      teamNeeds[r.rosterId] = calculateTeamNeeds(
        r,
        strengthData?.strengthsByRoster,
        strengthData?.leagueAverages
      );
    });

    const teamPlayers: Record<number, any[]> = {};
    if (playersMap) {
      const positionOrder: Record<string, number> = {
        QB: 1,
        RB: 2,
        WR: 3,
        TE: 4,
      };
      rosters.forEach((r) => {
        const ids = getRosterPlayerIds(r);
        if (!ids.length) return;
        const starters = new Set((r.settings as any)?.starters?.map(String) ?? []);
        const players = ids
          .map((id) => {
            const player = playersMap.get(String(id));
            if (!player) return null;
            return {
              id: player.id,
              name: player.fullName,
              position: player.position ?? "UNK",
              team: player.team ?? null,
              isStarter: starters.has(player.id),
            };
          })
          .filter(Boolean) as Array<{ id: string; name: string; position: string; team: string | null; isStarter: boolean }>;

        players.sort((a, b) => {
          const aPos = positionOrder[a.position] ?? 99;
          const bPos = positionOrder[b.position] ?? 99;
          if (aPos !== bPos) return aPos - bPos;
          return a.name.localeCompare(b.name);
        });
        teamPlayers[r.rosterId] = players;
      });
    }

    const teamOrder = await storage.getLeagueTeamOrder(leagueId);
    res.json({
      league,
      rosters,
      users,
      picks,
      teamNeeds,
      ...(pickPredictions && { pickPredictions }),
      ...(teamOrder && { teamOrder }),
      ...(Object.keys(teamPlayers).length > 0 && { teamPlayers }),
    });
  });

  // PUT League Team Order (sticky draft board columns)
  app.put(api.league.teamOrder.path, async (req, res) => {
    const leagueId = req.params.id;
    const league = await storage.getLeague(leagueId);
    if (!league) return res.status(404).json({ message: "League not found" });
    const order = Array.isArray(req.body?.order) ? req.body.order.map(Number).filter((n: number) => Number.isFinite(n)) : [];
    if (order.length === 0) return res.status(400).json({ message: "order must be a non-empty array of roster IDs" });
    await storage.setLeagueTeamOrder(leagueId, order);
    res.json({ success: true });
  });

  // UPDATE Pick
  app.patch(api.picks.update.path, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      const input = api.picks.update.input.parse(req.body);
      const updated = await storage.updatePick(id, input);
      if (!updated) return res.status(404).json({ message: "Pick not found" });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // SAVE Pick Prediction (per user)
  app.post(api.picks.prediction.path, async (req, res) => {
    const id = parseInt(req.params.id);
    const userId = req.header("x-sleeper-user-id");
    if (!userId) return res.status(401).json({ message: "Missing user context" });
    try {
      const input = api.picks.prediction.input.parse(req.body);
      const pick = await storage.getPickById(id);
      if (!pick) return res.status(404).json({ message: "Pick not found" });
      const trimmed = input.comment.trim();
      if (!trimmed) {
        await storage.deletePickPrediction(id, userId);
      } else {
        await storage.upsertPickPrediction(id, userId, trimmed);
      }
      res.json({ success: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  return httpServer;
}
