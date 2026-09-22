'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { poiApi, type GeocodeCandidate } from '@/lib/api';

// Plan 01-04 task 2: the ambiguous-geocode candidate picker. No wireframe
// exists for this layout (01-UI-SPEC.md's "UI Considerations" table marks it
// unresolved) — this plan records "a simple radio-select list, one line per
// candidate address" as its own documented assumption, per the plan's
// flagged_assumptions.
export function GeocodeCandidateDialog({
  poiId,
  candidates,
  open,
  onOpenChange,
  onResolved,
}: {
  poiId: string;
  candidates: GeocodeCandidate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved: () => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Closing without choosing leaves the POI exactly as it was — nothing
      // is pre-selected the next time this dialog opens.
      setSelectedIndex(null);
    }
    onOpenChange(next);
  }

  async function handleConfirm() {
    if (selectedIndex === null) return;
    setIsSubmitting(true);
    try {
      await poiApi.selectCandidate(poiId, selectedIndex);
      setSelectedIndex(null);
      onOpenChange(false);
      onResolved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to select candidate — try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            We found more than one match for this address — pick the correct one:
          </DialogTitle>
        </DialogHeader>

        {/* The list scrolls inside the dialog body rather than growing the
            dialog past the viewport, so a two-candidate response and a
            ten-candidate response both render inside the same frame. */}
        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {candidates.map((candidate, index) => (
            <label
              key={`${candidate.address}-${index}`}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
            >
              <input
                type="radio"
                name="geocode-candidate"
                checked={selectedIndex === index}
                onChange={() => setSelectedIndex(index)}
              />
              <span>{candidate.address}</span>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button
            type="button"
            disabled={selectedIndex === null || isSubmitting}
            onClick={handleConfirm}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
