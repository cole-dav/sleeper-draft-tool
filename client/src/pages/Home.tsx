import { useState } from "react";
import { useLocation } from "wouter";
import { useFetchLeague } from "@/hooks/use-league";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Search, Loader2, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  const [leagueId, setLeagueId] = useState("");
  const [, setLocation] = useLocation();
  const fetchLeague = useFetchLeague();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leagueId) return;
    
    setError(null);
    try {
      await fetchLeague.mutateAsync(leagueId);
      setLocation(`/league/${leagueId}`);
    } catch (err: any) {
      setError(err.message || "Failed to fetch league");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center relative overflow-hidden p-4">
      {/* Background Decor */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-accent/20 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-accent mb-6 shadow-2xl shadow-primary/20">
            <Trophy className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold text-white mb-4 tracking-tight">
            League Analyzer
          </h1>
          <p className="text-lg text-muted-foreground">
            Visualize draft capital, analyze team needs, and dominate your Dynasty league.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-card/50 backdrop-blur-xl border-white/10 shadow-2xl">
            <CardContent className="p-6 sm:p-8">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="leagueId" className="text-sm font-medium text-foreground ml-1">
                    Sleeper League ID
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="leagueId"
                      value={leagueId}
                      onChange={(e) => setLeagueId(e.target.value)}
                      placeholder="e.g. 1049156432..."
                      className="pl-10 h-12 bg-background/50 border-white/10 focus:border-primary text-lg transition-all"
                    />
                  </div>
                </div>

                {error && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="text-destructive text-sm font-medium bg-destructive/10 p-3 rounded-lg flex items-center gap-2"
                  >
                    <span>⚠️</span> {error}
                  </motion.div>
                )}

                <Button 
                  type="submit" 
                  disabled={fetchLeague.isPending || !leagueId}
                  className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-primary to-primary/80 hover:to-primary shadow-lg shadow-primary/25 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {fetchLeague.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      Analyze League <ArrowRight className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>

        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center text-xs text-muted-foreground mt-8"
        >
          Not affiliated with Sleeper. Powered by Sleeper API.
        </motion.p>
      </div>
    </div>
  );
}
