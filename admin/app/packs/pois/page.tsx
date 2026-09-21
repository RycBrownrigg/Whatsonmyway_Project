'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { GeocodeStatusBadge } from '@/components/GeocodeStatusBadge';
import { packApi, poiApi } from '@/lib/api';

function formatAddress(poi: { addressStreet: string; addressCity: string; addressState: string; addressZip: string }) {
  return `${poi.addressStreet}, ${poi.addressCity}, ${poi.addressState} ${poi.addressZip}`;
}

function PoiListContent() {
  const searchParams = useSearchParams();
  const packId = searchParams.get('packId') ?? '';

  const packQuery = useQuery({
    queryKey: ['packs', packId],
    queryFn: () => packApi.get(packId),
    enabled: Boolean(packId),
  });

  const poiTypeId = packQuery.data?.pack.poiTypeId ?? undefined;

  const poisQuery = useQuery({
    queryKey: ['pois', poiTypeId],
    queryFn: () => poiApi.list({ poiTypeId }),
    enabled: Boolean(poiTypeId),
  });

  if (!packId) {
    return <p className="px-8 py-8 text-sm text-zinc-600">No pack selected.</p>;
  }

  const isLoading = packQuery.isLoading || poisQuery.isLoading;

  return (
    <div className="flex flex-1 flex-col gap-8 px-8 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900">POIs</h1>
        <Button asChild className="bg-blue-600 hover:bg-blue-700">
          <Link href={`/packs/pois/new?packId=${packId}`}>Add POI</Link>
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !poiTypeId ? (
        <p className="text-sm text-zinc-600">This pack has no POI type configured yet.</p>
      ) : (poisQuery.data ?? []).length === 0 ? (
        <div>
          <p className="text-sm font-semibold text-zinc-900">No POIs yet</p>
          <p className="mb-4 text-sm text-zinc-600">Add your first POI to start building this pack.</p>
          <Button asChild className="bg-blue-600 hover:bg-blue-700">
            <Link href={`/packs/pois/new?packId=${packId}`}>Add POI</Link>
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Geocode status</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(poisQuery.data ?? []).map((poi) => (
              <TableRow key={poi.id}>
                <TableCell className="max-w-48 truncate" title={poi.name}>
                  <Link
                    href={`/packs/pois/edit?id=${poi.id}&packId=${packId}`}
                    className="text-blue-600 hover:underline"
                  >
                    {poi.name}
                  </Link>
                </TableCell>
                <TableCell className="max-w-64 truncate" title={formatAddress(poi)}>
                  {formatAddress(poi)}
                </TableCell>
                <TableCell>
                  <GeocodeStatusBadge geocodeStatus={poi.geocodeStatus} />
                </TableCell>
                <TableCell>{new Date(poi.updatedAt).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export default function PoiListPage() {
  return (
    <Suspense fallback={<p className="px-8 py-8 text-sm text-zinc-600">Loading…</p>}>
      <PoiListContent />
    </Suspense>
  );
}
