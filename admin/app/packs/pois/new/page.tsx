'use client';

import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ApiError,
  packApi,
  poiApi,
  type PackFieldDefinition,
  type PackFilterDefinition,
} from '@/lib/api';

const FIXED_SCHEMA = z.object({
  name: z.string().min(1, 'Name is required.'),
  addressStreet: z.string().min(1, 'Street is required.'),
  addressCity: z.string().min(1, 'City is required.'),
  addressState: z.string().length(2, 'Use the 2-letter state code.'),
  addressZip: z.string().min(1, 'ZIP is required.'),
  phone: z.string().optional(),
  website: z.string().url('Enter a valid URL.').optional().or(z.literal('')),
  additionalInfo: z.string().optional(),
});

type FixedFormValues = z.infer<typeof FIXED_SCHEMA>;

type DynamicValue = string | boolean | string[] | undefined;

interface FormValues extends FixedFormValues {
  customFields: Record<string, DynamicValue>;
  filterValues: Record<string, DynamicValue>;
}

function buildDynamicSchema(fields: PackFieldDefinition[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    if (field.dataType === 'boolean') {
      shape[field.fieldKey] = field.isRequired ? z.literal(true, { message: `${field.label} is required.` }) : z.boolean().optional();
      continue;
    }
    let base = z.string();
    if (field.dataType === 'url') base = base.url('Enter a valid URL.');
    if (field.isRequired) {
      shape[field.fieldKey] = base.min(1, `${field.label} is required.`);
    } else {
      shape[field.fieldKey] = base.optional().or(z.literal(''));
    }
  }
  return z.object(shape).catchall(z.any());
}

function inlineErrorCopy(errorCode: string) {
  if (errorCode === 'ADDRESS_AMBIGUOUS') {
    return "We found more than one match for this address — pick the correct one from the POI edit screen's candidate picker.";
  }
  return "We couldn't verify this address. Double-check the street, city, state, and ZIP, then save again.";
}

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
      FIXED_SCHEMA.extend({
        customFields: buildDynamicSchema(fields),
        filterValues: z.record(z.string(), z.any()),
      }),
    [fields],
  );

  const form = useForm<FormValues>({
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

  function onSubmit(values: FormValues) {
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
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-xs text-red-600">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="addressStreet">Street</Label>
            <Input id="addressStreet" {...form.register('addressStreet')} />
            {form.formState.errors.addressStreet && (
              <p className="text-xs text-red-600">{form.formState.errors.addressStreet.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="addressCity">City</Label>
            <Input id="addressCity" {...form.register('addressCity')} />
            {form.formState.errors.addressCity && (
              <p className="text-xs text-red-600">{form.formState.errors.addressCity.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="addressState">State</Label>
            <Input id="addressState" maxLength={2} {...form.register('addressState')} />
            {form.formState.errors.addressState && (
              <p className="text-xs text-red-600">{form.formState.errors.addressState.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="addressZip">ZIP</Label>
            <Input id="addressZip" {...form.register('addressZip')} />
            {form.formState.errors.addressZip && (
              <p className="text-xs text-red-600">{form.formState.errors.addressZip.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input id="phone" type="tel" {...form.register('phone')} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="website">Website (optional)</Label>
            <Input id="website" type="url" {...form.register('website')} />
            {form.formState.errors.website && (
              <p className="text-xs text-red-600">{form.formState.errors.website.message}</p>
            )}
          </div>

          {geocodeErrorCode && (
            <p className="col-span-2 text-sm text-red-600">{inlineErrorCopy(geocodeErrorCode)}</p>
          )}

          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="additionalInfo">Additional Info</Label>
            <Textarea id="additionalInfo" rows={4} {...form.register('additionalInfo')} />
          </div>
        </div>

        {(fields.length > 0 || filters.length > 0) && (
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold text-zinc-900">Pack-specific details</h2>
            <div className="grid grid-cols-2 gap-4">
              {fields.map((field) => (
                <FieldControl key={field.id} field={field} form={form} />
              ))}
              {filters.map((filter) => (
                <FilterControl key={filter.id} filter={filter} form={form} />
              ))}
            </div>
          </div>
        )}

        <div>
          <Button type="submit" disabled={createPoi.isPending} className="bg-blue-600 hover:bg-blue-700">
            Add POI
          </Button>
        </div>
      </form>
    </div>
  );
}

function FieldControl({
  field,
  form,
}: {
  field: PackFieldDefinition;
  form: ReturnType<typeof useForm<FormValues>>;
}) {
  const path = `customFields.${field.fieldKey}` as const;
  const error = form.formState.errors.customFields?.[field.fieldKey as keyof object];

  if (field.dataType === 'boolean') {
    return (
      <div className="flex items-center gap-2">
        <Switch
          checked={Boolean(form.watch(path))}
          onCheckedChange={(checked) => form.setValue(path, checked)}
        />
        <Label>{field.label}</Label>
      </div>
    );
  }

  if (field.dataType === 'enum') {
    return (
      <div className="flex flex-col gap-2">
        <Label>{field.label}</Label>
        <Select
          value={(form.watch(path) as string) ?? ''}
          onValueChange={(value) => form.setValue(path, value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {(field.enumOptions ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && <p className="text-xs text-red-600">{String((error as { message?: string }).message)}</p>}
      </div>
    );
  }

  const inputType = field.dataType === 'number' ? 'number' : field.dataType === 'url' ? 'url' : field.dataType === 'phone' ? 'tel' : 'text';

  return (
    <div className="flex flex-col gap-2">
      <Label>{field.label}</Label>
      <Input type={inputType} {...form.register(path)} />
      {error && <p className="text-xs text-red-600">{String((error as { message?: string }).message)}</p>}
    </div>
  );
}

function FilterControl({
  filter,
  form,
}: {
  filter: PackFilterDefinition;
  form: ReturnType<typeof useForm<FormValues>>;
}) {
  const path = `filterValues.${filter.filterKey}` as const;

  if (filter.filterType === 'boolean') {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          checked={Boolean(form.watch(path))}
          onCheckedChange={(checked) => form.setValue(path, checked === true)}
        />
        <Label>{filter.label}</Label>
      </div>
    );
  }

  if (filter.filterType === 'single-select') {
    return (
      <div className="flex flex-col gap-2">
        <Label>{filter.label}</Label>
        <Select
          value={(form.watch(path) as string) ?? ''}
          onValueChange={(value) => form.setValue(path, value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {(filter.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  // multi-select
  const selected = (form.watch(path) as string[] | undefined) ?? [];
  return (
    <div className="flex flex-col gap-2">
      <Label>{filter.label}</Label>
      <div className="flex flex-col gap-1">
        {(filter.options ?? []).map((option) => (
          <div key={option} className="flex items-center gap-2">
            <Checkbox
              checked={selected.includes(option)}
              onCheckedChange={(checked) => {
                const next = checked === true
                  ? [...selected, option]
                  : selected.filter((value) => value !== option);
                form.setValue(path, next);
              }}
            />
            <Label>{option}</Label>
          </div>
        ))}
      </div>
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
