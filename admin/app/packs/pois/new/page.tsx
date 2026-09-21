'use client';

import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PoiDynamicFields, PoiFixedFields } from '@/components/PoiFormFields';
import { POI_FIXED_SCHEMA, buildPoiDynamicSchema, poiErrorCopy, type PoiFormValues } from '@/lib/poiForm';
import { ApiError, packApi, poiApi } from '@/lib/api';

function AddPoiContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const packId = searchParams.get('packId') ?? '';

  const packQuery = useQuery({
    queryKey: ['packs', packId],
    queryFn: () => packApi.get(packId),
    enabled: Boolean(packId),
  });

  const fields = packQuery.data?.fields ?? [];
  const filters = packQuery.data?.filters ?? [];

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

  const createPoi = useMutation({
    mutationFn: poiApi.create,
    onSuccess: (created) => {
      if (created.geocodeErrorCode) {
        toast.error('POI saved, but the address needs review — see the note below.');
        return;
      }
      toast.success('POI added');
      router.push(`/packs/pois?packId=${packId}`);
    },
    onError: (err) => {
      const code = err instanceof ApiError ? err.code : 'UNKNOWN_ERROR';
      toast.error(`Failed to add POI: ${code}`);
    },
  });

  if (!packId) {
    return <p className="px-8 py-8 text-sm text-zinc-600">No pack selected.</p>;
  }

  if (packQuery.isLoading) {
    return (
      <div className="px-8 py-8">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const poiTypeId = packQuery.data?.pack.poiTypeId;
  if (!poiTypeId) {
    return <p className="px-8 py-8 text-sm text-red-600">This pack has no POI type configured yet.</p>;
  }

  function onSubmit(values: PoiFormValues) {
    createPoi.mutate({
      poiTypeId: poiTypeId as string,
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
    });
  }

  const geocodeErrorCode = createPoi.data?.geocodeErrorCode ?? null;

  return (
    <div className="flex flex-1 flex-col gap-8 px-8 py-8">
      <h1 className="text-2xl font-semibold text-zinc-900">Add POI</h1>

      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-8">
        <PoiFixedFields form={form} />

        {geocodeErrorCode && (
          <p className="text-sm text-red-600">{poiErrorCopy(geocodeErrorCode)}</p>
        )}

        <PoiDynamicFields fields={fields} filters={filters} form={form} />

        <div>
          <Button type="submit" disabled={createPoi.isPending} className="bg-blue-600 hover:bg-blue-700">
            Add POI
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function AddPoiPage() {
  return (
    <Suspense fallback={<p className="px-8 py-8 text-sm text-zinc-600">Loading…</p>}>
      <AddPoiContent />
    </Suspense>
  );
}
