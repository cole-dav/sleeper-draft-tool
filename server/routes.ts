import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { type InsertDraftPick } from "@shared/schema";

// --- Mock KTC Values ---
// In a real app, scrape KTC or use their API if available.
// Here we define positional weights/values for team need calculation.
// Lower score in a position = Higher Need.
const POSITIONAL_WEIGHTS = {
  QB: 25,
  RB: 15,
  WR: 20,
  TE: 15,
  K: 1,
  DEF: 2
};
// Mock function to "grade" a roster
function calculateTeamNeeds(roster: any, allRosters: any[]) {
  // In a real app, we'd parse `roster.players` (which are IDs) and look up their values.
  // Since we don't have a player DB, we will use `roster.settings.fpts` (fantasy points) or similar as a proxy
  // or just randomize for this demo if data is missing.
  
  // Sleeper rosters have `players` array of IDs.
  // We can't know positions without fetching player data from Sleeper (5000+ items).
  // For this MVP, we will simulate "Needs" based on roster settings (wins/losses/points) 
  // and just assign random high/low needs to demonstrate the UI.
  
  // REAL IMPLEMENTATION PLAN:
  // 1. Fetch all players from https://api.sleeper.app/v1/players/nfl (Heavy endpoint, cache this!)
  // 2. Map roster players to positions.
  // 3. Sum KTC values.
  
  // MVP SHORTCUT:
  // Randomly assign needs for demonstration purposes since we don't have player metadata loaded.
  const positions = ["QB", "RB", "WR", "TE"];
  return positions.map(pos => ({
    position: pos,
    score: Math.floor(Math.random() * 100) // Random score 0-100
  })).sort((a, b) => a.score - b.score); // Lowest score = highest need
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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
        settings: leagueData.settings,
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
        settings: r.settings
      }));
      await storage.upsertRosters(rostersList);

      // 4. Generate & Resolve Picks
      // Fetch traded picks
      const tradedRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`);
      const tradedPicks = await tradedRes.json();

      // Clear existing picks to rebuild
      await storage.clearPicks(leagueId);

      const picksToInsert: InsertDraftPick[] = [];
      const currentSeason = parseInt(leagueData.season);
      const rounds = leagueData.settings.draft_rounds || 3; // Default 3 rounds

      // Generate base picks for next 3 years
      for (let year = currentSeason; year < currentSeason + 3; year++) {
        for (let round = 1; round <= rounds; round++) {
          for (const roster of rostersData) {
            // Check if this specific pick was traded
            const traded = tradedPicks.find((tp: any) => 
              tp.season === String(year) && 
              tp.round === round && 
              tp.roster_id === roster.roster_id // Original owner
            );

            picksToInsert.push({
              leagueId: leagueId,
              season: String(year),
              round: round,
              rosterId: roster.roster_id, // Original Owner
              ownerId: traded ? traded.owner_id : roster.roster_id, // Current Owner (traded or original)
              previousOwnerId: traded ? traded.previous_owner_id : null,
              pickSlot: null, // Default empty, user can override
            });
          }
        }
      }
      
      // Look up owner roster IDs for traded picks (Sleeper traded_picks uses roster_id for original, owner_id for current)
      // Note: Traded picks API owner_id is the ROSTER ID of the new owner usually? 
      // Wait, Sleeper API docs say owner_id in traded_picks is the roster_id of the new owner.
      // And in my schema ownerId is rosterId. So this matches.
      
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

    // Calculate Team Needs
    const teamNeeds: Record<number, any> = {};
    rosters.forEach(r => {
      teamNeeds[r.rosterId] = calculateTeamNeeds(r, rosters);
    });

    res.json({
      league,
      rosters,
      users,
      picks,
      teamNeeds
    });
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

  return httpServer;
}
