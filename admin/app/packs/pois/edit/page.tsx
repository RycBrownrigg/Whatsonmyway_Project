'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { GeocodeStatusBadge } from '@/components/GeocodeStatusBadge';
import { PoiDynamicFields, PoiFixedFields } from '@/components/PoiFormFields';
import { POI_FIXED_SCHEMA, buildPoiDynamicSchema, poiErrorCopy, type PoiFormValues } from '@/lib/poiForm';
import { ApiError, packApi, poiApi, type CreatePoiResponse } from '@/lib/api';

function EditPoiContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? '';
  const packId = searchParams.get('packId') ?? '';

  const poiQuery = useQuery({
    queryKey: ['pois', 'detail', id],
    queryFn: () => poiApi.get(id),
    enabled: Boolean(id),
  });

  const packQuery = useQuery({
    queryKey: ['packs', packId],
    queryFn: () => packApi.get(packId),
    enabled: Boolean(packId),
  });

  const fields = packQuery.data?.fields ?? [];
  const filters = packQuery.data?.filters ?? [];
  const poi = poiQuery.data;

  const schema = useMemo(
    () =>
      POI_FIXED_SCHEMA.extend({
        customFields: buildPoiDynamicSchema(fields),
        filterValues: z.record(z.string(), z.any()),
      }),
    [fields],
  );

  const form = useForm<PoiFormValues>({
    resolver: zodResolver(schema),
    // `values` (rather than `defaultValues`) keeps the form in sync once the
    // POI query resolves — the form starts empty, then is fully re-populated
    // the moment `poi` loads, pre-filling every control including the
    // pack-specific custom fields and filter values.
    values: poi
      ? {
          name: poi.name,
          addressStreet: poi.addressStreet,
          addressCity: poi.addressCity,
          addressState: poi.addressState,
          addressZip: poi.addressZip,
          phone: poi.phone ?? '',
          website: poi.website ?? '',
          additionalInfo: poi.additionalInfo ?? '',
          customFields: (poi.customFields as PoiFormValues['customFields']) ?? {},
          filterValues: (poi.filterValues as PoiFormValues['filterValues']) ?? {},
        }
      : undefined,
    defaultValues: {
      name: '',
      addressStreet: '',
      addressCity: '',
      addressState: '',
      addressZip: '',
      phone: '',
      website: '',
      additionalInfo: '',
      customFields: {},
      filterValues: {},
    },
  });

  function applyResponse(response: CreatePoiResponse) {
    queryClient.setQueryData(['pois', 'detail', id], response);
    queryClient.invalidateQueries({ queryKey: ['pois'] });
  }

  const updatePoi = useMutation({
    mutationFn: (values: PoiFormValues) =>
      poiApi.update(id, {
        name: values.name,
        addressStreet: values.addressStreet,
        addressCity: values.addressCity,
        addressState: values.addressState,
        addressZip: values.addressZip,
        phone: values.phone || undefined,
        website: values.website || undefined,
        additionalInfo: values.additionalInfo || undefined,
        customFields: values.customFields,
        filterValues: values.filterValues,
      }),
    onSuccess: (updated) => {
      applyResponse(updated);
      if (updated.geocodeErrorCode) {
        toast.error('Saved, but the address still needs review — see the note below.');
        return;
      }
      toast.success('POI updated');
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : 'UNKNOWN_ERROR';
      toast.error(`Failed to save changes: ${code}`);
    },
  });

  const retryGeocode = useMutation({
    mutationFn: () => poiApi.retryGeocode(id),
    onSuccess: (updated) => {
      applyResponse(updated);
      if (updated.geocodeErrorCode) {
        toast.error('Still not resolved — see the note below.');
        return;
      }
      toast.success('Address resolved');
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : 'UNKNOWN_ERROR';
      toast.error(`Retry failed: ${code}`);
    },
  });

  if (!id) {
    return <p className="px-8 py-8 text-sm text-zinc-600">No POI selected.</p>;
  }

  if (poiQuery.isLoading || packQuery.isLoading) {
    return (
      <div className="px-8 py-8">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!poi) {
    return <p className="px-8 py-8 text-sm text-red-600">POI not found.</p>;
  }

  function onSubmit(values: PoiFormValues) {
    updatePoi.mutate(values);
  }

  const geocodeErrorCode = updatePoi.data?.geocodeErrorCode ?? retryGeocode.data?.geocodeErrorCode ?? null;
  const geocodeStatus = poi.geocodeStatus;
  const geocodeConfidence = poi.geocodeConfidence;

  return (
    <div className="flex flex-1 flex-col gap-8 px-8 py-8">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold text-zinc-900">Edit POI</h1>
        <GeocodeStatusBadge geocodeStatus={geocodeStatus} />
        {geocodeConfidence !== null && (
          <span className="text-sm text-zinc-600">{geocodeConfidence.toFixed(2)}</span>
        )}
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-8">
        <PoiFixedFields form={form} />

        {geocodeErrorCode && (
          <p className="text-sm text-red-600">{poiErrorCopy(geocodeErrorCode)}</p>
        )}

        <PoiDynamicFields fields={fields} filters={filters} form={form} />

        <div className="flex items-center gap-4">
          <Button type="submit" disabled={updatePoi.isPending} className="bg-blue-600 hover:bg-blue-700">
            Save Changes
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={retryGeocode.isPending}
            onClick={() => retryGeocode.mutate()}
          >
            Retry Geocode
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function EditPoiPage() {
  return (
    <Suspense fallback={<p className="px-8 py-8 text-sm text-zinc-600">Loading…</p>}>
      <EditPoiContent />
    </Suspense>
  );
}
