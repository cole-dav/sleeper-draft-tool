import { useState } from "react";
import { DraftPick, UpdateDraftPick } from "@shared/schema";
import { useUpdatePick } from "@/hooks/use-league";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Edit2, BadgeCheck } from "lucide-react";

interface PickCardProps {
  pick: DraftPick;
  originalOwnerName?: string;
}

export function PickCard({ pick, originalOwnerName }: PickCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [slot, setSlot] = useState(pick.pickSlot || "");
  const updatePick = useUpdatePick();

  const handleSave = async () => {
    try {
      await updatePick.mutateAsync({ id: pick.id, pickSlot: slot });
      setIsOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const isTransferred = pick.previousOwnerId && pick.previousOwnerId !== pick.ownerId;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button className="w-full text-left group relative">
          <div className={`
            p-3 rounded-lg border text-sm transition-all duration-200
            ${isTransferred 
              ? "bg-accent/10 border-accent/30 hover:border-accent/60" 
              : "bg-secondary/40 border-white/5 hover:border-white/20"}
            hover:shadow-lg hover:-translate-y-0.5
          `}>
            <div className="flex justify-between items-start gap-2">
              <div>
                <div className="font-bold font-mono text-xs text-muted-foreground mb-0.5">
                  {pick.season} ROUND {pick.round}
                </div>
                <div className="font-semibold text-foreground">
                  {pick.pickSlot ? (
                    <span className="text-primary flex items-center gap-1">
                      {pick.pickSlot}
                      <BadgeCheck className="w-3 h-3" />
                    </span>
                  ) : (
                    <span>Round {pick.round}</span>
                  )}
                </div>
              </div>
              <Edit2 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2" />
            </div>
            
            {originalOwnerName && isTransferred && (
              <div className="mt-2 text-xs text-accent-foreground/70 flex items-center gap-1">
                <span>from</span>
                <span className="font-medium text-accent-foreground">{originalOwnerName}</span>
              </div>
            )}
          </div>
        </button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[425px] bg-card border-white/10">
        <DialogHeader>
          <DialogTitle>Edit Pick Slot</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="slot">Pick Slot Override</Label>
            <Input
              id="slot"
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
              placeholder="e.g. 1.04"
              className="bg-background border-white/10 focus:border-primary"
            />
            <p className="text-sm text-muted-foreground">
              Manually set the specific pick number if known (e.g. "1.01" or "Early 1st").
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={updatePick.isPending}>
            {updatePick.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
