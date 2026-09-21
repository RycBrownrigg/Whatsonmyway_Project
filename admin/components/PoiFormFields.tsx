'use client';

import type { UseFormReturn } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PackFieldDefinition, PackFilterDefinition } from '@/lib/api';
import type { PoiFormValues } from '@/lib/poiForm';

// Shared control set (plan 01-04): the fixed address block plus additional
// info, rendered identically by the Add POI (new) and edit screens so there
// is exactly one implementation of this markup, not two drifting copies.
export function PoiFixedFields({ form }: { form: UseFormReturn<PoiFormValues> }) {
  return (
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

      <div className="col-span-2 flex flex-col gap-2">
        <Label htmlFor="additionalInfo">Additional Info</Label>
        <Textarea id="additionalInfo" rows={4} {...form.register('additionalInfo')} />
      </div>
    </div>
  );
}

export function PoiDynamicFields({
  fields,
  filters,
  form,
}: {
  fields: PackFieldDefinition[];
  filters: PackFilterDefinition[];
  form: UseFormReturn<PoiFormValues>;
}) {
  if (fields.length === 0 && filters.length === 0) return null;

  return (
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
  );
}

function FieldControl({
  field,
  form,
}: {
  field: PackFieldDefinition;
  form: UseFormReturn<PoiFormValues>;
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

  const inputType =
    field.dataType === 'number' ? 'number' : field.dataType === 'url' ? 'url' : field.dataType === 'phone' ? 'tel' : 'text';

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
  form: UseFormReturn<PoiFormValues>;
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
                const next =
                  checked === true ? [...selected, option] : selected.filter((value) => value !== option);
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
