import type { Handler } from "@netlify/functions";
import { storage } from "../../server/storage";
import { api } from "../../shared/routes";
import type { InsertDraftPick } from "../../shared/schema";
import { z } from "zod";

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

function jsonResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

const handler: Handler = async (event) => {
  const path = event.rawUrl ? new URL(event.rawUrl).pathname : event.path;
  const sleeperUserMatch = path.match(/^\/api\/sleeper\/user\/([^/]+)$/);
  const pathMatch = path.match(/^\/api\/league\/([^/]+)\/fetch$/);
  const getMatch = path.match(/^\/api\/league\/([^/]+)$/);
  const teamOrderMatch = path.match(/^\/api\/league\/([^/]+)\/team-order$/);
  const pickMatch = path.match(/^\/api\/picks\/(\d+)$/);
  const pickPredictionMatch = path.match(/^\/api\/picks\/(\d+)\/prediction$/);

  try {
    if (event.httpMethod === "GET" && sleeperUserMatch) {
      const username = decodeURIComponent(sleeperUserMatch[1]);
      const userRes = await fetch(`https://api.sleeper.app/v1/user/${encodeURIComponent(username)}`);
      if (!userRes.ok) return jsonResponse(404, { message: "User not found" });
      const user = await userRes.json();
      return jsonResponse(200, {
        userId: user.user_id,
        username: user.username,
        displayName: user.display_name,
        avatar: user.avatar,
      });
    }

    if (event.httpMethod === "POST" && pathMatch) {
      const leagueId = pathMatch[1];
      const leagueRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`);
      if (!leagueRes.ok) throw new Error("League not found");
      const leagueData = await leagueRes.json();

      await storage.upsertLeague({
        leagueId: String(leagueData.league_id),
        name: leagueData.name || "Unknown League",
        totalRosters: leagueData.total_rosters ?? 12,
        season: String(leagueData.season || new Date().getFullYear()),
        avatar: leagueData.avatar ?? null,
        settings: {
          ...(leagueData.settings ?? {}),
          roster_positions: leagueData.roster_positions ?? [],
          scoring_settings: leagueData.scoring_settings ?? {},
        },
      });

      const usersRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
      const usersData = await usersRes.json();
      const usersList = (Array.isArray(usersData) ? usersData : []).map((u: any) => ({
        userId: String(u.user_id),
        leagueId: leagueId,
        displayName: String(u.display_name ?? "Unknown"),
        avatar: u.avatar ?? null,
      }));
      await storage.upsertUsers(usersList);

      const rostersRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
      const rostersData = await rostersRes.json();
      const rostersList = (Array.isArray(rostersData) ? rostersData : []).map((r: any) => ({
        leagueId: leagueId,
        rosterId: r.roster_id,
        ownerId: r.owner_id ?? null,
        settings: {
          ...(r.settings ?? {}),
          players: r.players ?? [],
          starters: r.starters ?? [],
          taxi: r.taxi ?? [],
          reserve: r.reserve ?? [],
        },
      }));
      await storage.upsertRosters(rostersList);

      const tradedRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`);
      const tradedPicksRaw = await tradedRes.json();
      const tradedPicks = Array.isArray(tradedPicksRaw) ? tradedPicksRaw : [];

      await storage.clearPicks(leagueId);

      const currentSeason = parseInt(String(leagueData.season), 10) || new Date().getFullYear();
      const rounds = leagueData.settings?.draft_rounds ?? 3;
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
          const byRound: Record<number, number[]> = {};
          for (let r = 1; r <= rounds; r++) {
            byRound[r] = r === 1 || !isSnake ? [...round1Order] : [...round1Order].reverse();
          }
          seasonDraftOrder[season] = byRound;
        }
      } catch (_) {
        /* non-fatal */
      }

      const picksToInsert: InsertDraftPick[] = [];
      for (let year = currentSeason; year < currentSeason + 3; year++) {
        const seasonStr = String(year);
        const draftOrder = seasonDraftOrder[seasonStr];
        for (let round = 1; round <= rounds; round++) {
          const roundOrder = draftOrder?.[round];
          for (const roster of rostersData) {
            const traded = tradedPicks.find(
              (tp: any) =>
                tp.season === seasonStr &&
                tp.round === round &&
                tp.roster_id === roster.roster_id
            );
            let pickSlot: string | null = null;
            if (roundOrder) {
              const pos = roundOrder.indexOf(roster.roster_id);
              if (pos >= 0) pickSlot = `${round}.${String(pos + 1).padStart(2, "0")}`;
            }
            picksToInsert.push({
              leagueId: leagueId,
              season: seasonStr,
              round: round,
              rosterId: roster.roster_id,
              ownerId: traded ? traded.owner_id : roster.roster_id,
              previousOwnerId: traded ? traded.previous_owner_id : null,
              pickSlot,
            });
          }
        }
      }
      await storage.upsertPicks(picksToInsert);

      return jsonResponse(200, api.league.fetch.responses[200].parse({ success: true }));
    }

    if (event.httpMethod === "GET" && getMatch) {
      const leagueId = getMatch[1];
      const league = await storage.getLeague(leagueId);
      if (!league) return jsonResponse(404, { message: "League not found" });

      const rosters = await storage.getRosters(leagueId);
      const users = await storage.getUsers(leagueId);
      const picks = await storage.getPicks(leagueId);
      const userId = event.headers?.["x-sleeper-user-id"];
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
      const teamNeeds: Record<number, { position: string; score: number }[]> = {};
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
      return jsonResponse(200, {
        league,
        rosters,
        users,
        picks,
        teamNeeds,
        ...(pickPredictions && { pickPredictions }),
        ...(teamOrder && { teamOrder }),
        ...(Object.keys(teamPlayers).length > 0 && { teamPlayers }),
      });
    }

    if (event.httpMethod === "PUT" && teamOrderMatch) {
      const leagueId = teamOrderMatch[1];
      const league = await storage.getLeague(leagueId);
      if (!league) return jsonResponse(404, { message: "League not found" });
      const body = event.body ? JSON.parse(event.body) : {};
      const order = Array.isArray(body?.order) ? body.order.map(Number).filter((n: number) => Number.isFinite(n)) : [];
      if (order.length === 0) return jsonResponse(400, { message: "order must be a non-empty array of roster IDs" });
      await storage.setLeagueTeamOrder(leagueId, order);
      return jsonResponse(200, { success: true });
    }

    if (event.httpMethod === "PATCH" && pickMatch) {
      const id = parseInt(pickMatch[1], 10);
      const body = event.body ? JSON.parse(event.body) : {};
      const input = api.picks.update.input.parse(body);
      const updated = await storage.updatePick(id, input);
      if (!updated) return jsonResponse(404, { message: "Pick not found" });
      return jsonResponse(200, updated);
    }

    if (event.httpMethod === "POST" && pickPredictionMatch) {
      const id = parseInt(pickPredictionMatch[1], 10);
      const userId = event.headers?.["x-sleeper-user-id"];
      if (!userId) return jsonResponse(401, { message: "Missing user context" });
      const body = event.body ? JSON.parse(event.body) : {};
      const input = api.picks.prediction.input.parse(body);
      const pick = await storage.getPickById(id);
      if (!pick) return jsonResponse(404, { message: "Pick not found" });
      const trimmed = String(input.comment ?? "").trim();
      if (!trimmed) {
        await storage.deletePickPrediction(id, userId);
      } else {
        await storage.upsertPickPrediction(id, userId, trimmed);
      }
      return jsonResponse(200, { success: true });
    }

    return jsonResponse(404, { message: "Not found" });
  } catch (e: any) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("API error:", err.message, err.stack);
    if (err.message === "League not found") return jsonResponse(404, { message: err.message });
    if (e instanceof z.ZodError) return jsonResponse(400, { message: e.errors[0]?.message || "Validation error" });
    return jsonResponse(500, {
      message: err.message || "Internal server error",
      hint: "Check Netlify Functions logs and DATABASE_URL. Use Supabase pooler (port 6543) for serverless.",
    });
  }
};

export { handler };
