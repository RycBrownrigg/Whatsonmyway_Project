import { Badge } from '@/components/ui/badge';
import type { GeocodeStatus } from '@/lib/api';

// D-02 — a separate semantic colour set, deliberately outside the 60/30/10
// accent budget (01-UI-SPEC.md's Color section). Never reuse blue-600 here.
const STATUS_STYLES: Record<GeocodeStatus, { label: string; className: string }> = {
  ok: { label: 'Geocoded', className: 'bg-green-600 text-white hover:bg-green-600' },
  low_confidence: { label: 'Low confidence', className: 'bg-amber-600 text-white hover:bg-amber-600' },
  failed: { label: 'Failed', className: 'bg-red-600 text-white hover:bg-red-600' },
  pending: { label: 'Pending', className: 'bg-zinc-500 text-white hover:bg-zinc-500' },
};

export function GeocodeStatusBadge({ geocodeStatus }: { geocodeStatus: GeocodeStatus }) {
  const { label, className } = STATUS_STYLES[geocodeStatus];
  return <Badge className={className}>{label}</Badge>;
}
