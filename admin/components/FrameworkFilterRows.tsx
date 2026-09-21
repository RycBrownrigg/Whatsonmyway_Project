'use client';

import { forwardRef, useImperativeHandle } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RemoveDefinitionButton } from '@/components/FrameworkFieldRows';
import {
  ApiError,
  packApi,
  type CreateFilterInput,
  type PackFilterDefinition,
  type UpdateFilterInput,
} from '@/lib/api';

const FILTER_TYPES: CreateFilterInput['filterType'][] = ['boolean', 'single-select', 'multi-select'];

// Mirrors api/src/routes/admin/filters.ts's CreateFilterSchema so an invalid row
// is rejected client-side with the same rules the server enforces.
const draftFilterSchema = z
  .object({
    filterKey: z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/, 'Start with a letter; letters, digits, underscore only.'),
    label: z.string().min(1, 'Label is required.'),
    filterType: z.enum(['boolean', 'single-select', 'multi-select']),
    optionsText: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      (data.filterType === 'single-select' || data.filterType === 'multi-select') &&
      parseOptions(data.optionsText).length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'single-select and multi-select filters need at least one option.',
        path: ['optionsText'],
      });
    }
  });

const draftFormSchema = z.object({ rows: z.array(draftFilterSchema) });

type DraftFormValues = z.infer<typeof draftFormSchema>;

function parseOptions(text: string | undefined): string[] {
  return (text ?? '')
    .split(',')
    .map((option) => option.trim())
    .filter((option) => option.length > 0);
}

function emptyDraftRow(): DraftFormValues['rows'][number] {
  return { filterKey: '', label: '', filterType: 'boolean', optionsText: '' };
}

export interface FrameworkFilterRowsHandle {
  commitDrafts: () => Promise<void>;
}

interface FrameworkFilterRowsProps {
  packId: string;
  filters: PackFilterDefinition[];
  onDraftCountChange?: (count: number) => void;
}

export const FrameworkFilterRows = forwardRef<FrameworkFilterRowsHandle, FrameworkFilterRowsProps>(
  function FrameworkFilterRows({ packId, filters, onDraftCountChange }, ref) {
    const queryClient = useQueryClient();

    const form = useForm<DraftFormValues>({
      resolver: zodResolver(draftFormSchema),
      defaultValues: { rows: [] },
    });
    const { fields: draftRows, append, remove } = useFieldArray({
      control: form.control,
      name: 'rows',
    });

    function invalidate() {
      queryClient.invalidateQueries({ queryKey: ['packs', packId] });
    }

    const updateFilter = useMutation({
      mutationFn: ({ filterId, input }: { filterId: string; input: UpdateFilterInput }) =>
        packApi.updateFilter(packId, filterId, input),
      onSuccess: invalidate,
      onError: (err) => {
        const code = err instanceof ApiError ? err.code : 'UNKNOWN_ERROR';
        toast.error(`Failed to update filter: ${code}`);
      },
    });

    const removeFilter = useMutation({
      mutationFn: (filterId: string) => packApi.removeFilter(packId, filterId),
      onSuccess: () => {
        toast.success('Filter removed');
        invalidate();
      },
      onError: (err) => {
        const code = err instanceof ApiError ? err.code : 'UNKNOWN_ERROR';
        toast.error(`Failed to remove filter: ${code}`);
      },
    });

    useImperativeHandle(ref, () => ({
      commitDrafts: async () => {
        const values = await new Promise<DraftFormValues | null>((resolve) => {
          form.handleSubmit(
            (valid) => resolve(valid),
            () => resolve(null),
          )();
        });
        if (!values || values.rows.length === 0) return;

        for (const row of values.rows) {
          const needsOptions = row.filterType === 'single-select' || row.filterType === 'multi-select';
          await packApi.addFilter(packId, {
            filterKey: row.filterKey,
            label: row.label,
            filterType: row.filterType,
            options: needsOptions ? parseOptions(row.optionsText) : undefined,
          });
        }
        form.reset({ rows: [] });
        onDraftCountChange?.(0);
        invalidate();
      },
    }));

    function handleAddRow() {
      append(emptyDraftRow());
      onDraftCountChange?.(draftRows.length + 1);
    }

    function handleRemoveDraft(index: number) {
      remove(index);
      onDraftCountChange?.(Math.max(draftRows.length - 1, 0));
    }

    const isEmpty = filters.length === 0 && draftRows.length === 0;

    return (
      <div className="flex flex-col gap-4">
        {isEmpty ? (
          <div>
            <p className="text-sm font-semibold text-zinc-900">No filters yet</p>
            <p className="text-sm text-zinc-600">
              Add a filter to start building this pack&apos;s data shape.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filters.map((filter, index) => (
              <div key={filter.id}>
                {index > 0 && <Separator className="mb-4" />}
                <SavedFilterRow
                  filter={filter}
                  onUpdate={(input) => updateFilter.mutate({ filterId: filter.id, input })}
                  onRemove={() => removeFilter.mutate(filter.id)}
                />
              </div>
            ))}
            {filters.length > 0 && draftRows.length > 0 && <Separator />}
            {draftRows.map((row, index) => (
              <div key={row.id}>
                {index > 0 && <Separator className="mb-4" />}
                <DraftFilterRow
                  form={form}
                  index={index}
                  onRemove={() => handleRemoveDraft(index)}
                />
              </div>
            ))}
          </div>
        )}

        <div>
          <Button type="button" variant="secondary" onClick={handleAddRow}>
            + Add Filter
          </Button>
        </div>
      </div>
    );
  },
);

function SavedFilterRow({
  filter,
  onUpdate,
  onRemove,
}: {
  filter: PackFilterDefinition;
  onUpdate: (input: UpdateFilterInput) => void;
  onRemove: () => void;
}) {
  const needsOptions = filter.filterType === 'single-select' || filter.filterType === 'multi-select';

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-2">
        <Label>Key</Label>
        <Input value={filter.filterKey} disabled className="w-40" />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Label</Label>
        <Input
          defaultValue={filter.label}
          className="w-48"
          onBlur={(e) => {
            if (e.target.value && e.target.value !== filter.label) {
              onUpdate({ label: e.target.value });
            }
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Filter Type</Label>
        <Select
          value={filter.filterType}
          onValueChange={(value) => onUpdate({ filterType: value as CreateFilterInput['filterType'] })}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTER_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {needsOptions && (
        <div className="flex flex-col gap-2">
          <Label>Options (comma-separated)</Label>
          <Input
            defaultValue={(filter.options ?? []).join(', ')}
            className="w-64"
            onBlur={(e) => onUpdate({ options: parseOptions(e.target.value) })}
          />
        </div>
      )}
      <RemoveDefinitionButton title="Remove filter" label={filter.label} onConfirm={onRemove} />
    </div>
  );
}

function DraftFilterRow({
  form,
  index,
  onRemove,
}: {
  form: ReturnType<typeof useForm<DraftFormValues>>;
  index: number;
  onRemove: () => void;
}) {
  const filterType = form.watch(`rows.${index}.filterType`);
  const needsOptions = filterType === 'single-select' || filterType === 'multi-select';
  const errors = form.formState.errors.rows?.[index];

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-2">
        <Label>Key</Label>
        <Input className="w-40" {...form.register(`rows.${index}.filterKey`)} />
        {errors?.filterKey && <p className="text-xs text-red-600">{errors.filterKey.message}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label>Label</Label>
        <Input className="w-48" {...form.register(`rows.${index}.label`)} />
        {errors?.label && <p className="text-xs text-red-600">{errors.label.message}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label>Filter Type</Label>
        <Select
          value={filterType}
          onValueChange={(value) =>
            form.setValue(`rows.${index}.filterType`, value as CreateFilterInput['filterType'])
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTER_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {needsOptions && (
        <div className="flex flex-col gap-2">
          <Label>Options (comma-separated)</Label>
          <Input className="w-64" {...form.register(`rows.${index}.optionsText`)} />
          {errors?.optionsText && <p className="text-xs text-red-600">{errors.optionsText.message}</p>}
        </div>
      )}
      <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700" onClick={onRemove}>
        Remove
      </Button>
    </div>
  );
}
