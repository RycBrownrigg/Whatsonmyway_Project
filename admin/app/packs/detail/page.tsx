'use client';

import { Suspense, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FrameworkFieldRows, type FrameworkFieldRowsHandle } from '@/components/FrameworkFieldRows';
import { FrameworkFilterRows, type FrameworkFilterRowsHandle } from '@/components/FrameworkFilterRows';
import { ApiError, packApi } from '@/lib/api';

function PackDetailContent() {
  const searchParams = useSearchParams();
  const packId = searchParams.get('id') ?? '';

  const detailQuery = useQuery({
    queryKey: ['packs', packId],
    queryFn: () => packApi.get(packId),
    enabled: Boolean(packId),
  });

  const fieldsRef = useRef<FrameworkFieldRowsHandle>(null);
  const filtersRef = useRef<FrameworkFilterRowsHandle>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSaveFramework() {
    setIsSaving(true);
    try {
      await Promise.all([
        fieldsRef.current?.commitDrafts(),
        filtersRef.current?.commitDrafts(),
      ]);
      toast.success('Pack framework saved');
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'UNKNOWN_ERROR';
      toast.error(`Failed to save pack framework: ${code}`);
    } finally {
      setIsSaving(false);
    }
  }

  if (!packId) {
    return <p className="px-8 py-8 text-sm text-zinc-600">No pack selected.</p>;
  }

  if (detailQuery.isLoading) {
    return <p className="px-8 py-8 text-sm text-zinc-600">Loading…</p>;
  }

  if (detailQuery.isError) {
    return <p className="px-8 py-8 text-sm text-red-600">Could not load this pack.</p>;
  }

  const { pack, fields, filters } = detailQuery.data!;

  return (
    <div className="flex flex-1 flex-col gap-8 px-8 py-8">
      <Card>
        <CardHeader>
          <CardTitle>{pack.name}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 text-sm text-zinc-700">
          <span>Slug: {pack.slug}</span>
          <span>Type: {pack.packType}</span>
          <span>Status: {pack.status}</span>
          <span>Apple Product ID: {pack.appleProductId}</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fields</CardTitle>
        </CardHeader>
        <CardContent>
          <FrameworkFieldRows ref={fieldsRef} packId={packId} fields={fields} />
        </CardContent>
      </Card>

      {/* Parent's flex gap-8 (32px) already separates every section; +mt-4 (16px)
          brings Fields-to-Filters up to the 2xl (48px) major-section break
          01-UI-SPEC.md specifies for this particular boundary. */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <FrameworkFilterRows ref={filtersRef} packId={packId} filters={filters} />
        </CardContent>
      </Card>

      <div>
        <Button
          onClick={handleSaveFramework}
          disabled={isSaving}
          className="bg-blue-600 hover:bg-blue-700"
        >
          Save Pack Framework
        </Button>
      </div>
    </div>
  );
}

export default function PackDetailPage() {
  return (
    <Suspense fallback={<p className="px-8 py-8 text-sm text-zinc-600">Loading…</p>}>
      <PackDetailContent />
    </Suspense>
  );
}
