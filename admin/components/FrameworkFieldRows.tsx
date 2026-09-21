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
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  ApiError,
  packApi,
  type CreateFieldInput,
  type PackFieldDefinition,
  type UpdateFieldInput,
} from '@/lib/api';

const DATA_TYPES: CreateFieldInput['dataType'][] = [
  'text',
  'number',
  'boolean',
  'url',
  'phone',
  'enum',
];

// Mirrors api/src/routes/admin/fields.ts's CreateFieldSchema so an invalid row is
// rejected client-side with the same rules the server enforces.
const draftFieldSchema = z
  .object({
    fieldKey: z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/, 'Start with a letter; letters, digits, underscore only.'),
    label: z.string().min(1, 'Label is required.'),
    dataType: z.enum(['text', 'number', 'boolean', 'url', 'phone', 'enum']),
    enumOptionsText: z.string().optional(),
    isRequired: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.dataType === 'enum' && parseOptions(data.enumOptionsText).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enum fields need at least one option.',
        path: ['enumOptionsText'],
      });
    }
  });

const draftFormSchema = z.object({ rows: z.array(draftFieldSchema) });

type DraftFormValues = z.infer<typeof draftFormSchema>;

function parseOptions(text: string | undefined): string[] {
  return (text ?? '')
    .split(',')
    .map((option) => option.trim())
    .filter((option) => option.length > 0);
}

function emptyDraftRow(): DraftFormValues['rows'][number] {
  return { fieldKey: '', label: '', dataType: 'text', enumOptionsText: '', isRequired: false };
}

export interface FrameworkFieldRowsHandle {
  commitDrafts: () => Promise<void>;
}

interface FrameworkFieldRowsProps {
  packId: string;
  fields: PackFieldDefinition[];
  onDraftCountChange?: (count: number) => void;
}

export const FrameworkFieldRows = forwardRef<FrameworkFieldRowsHandle, FrameworkFieldRowsProps>(
  function FrameworkFieldRows({ packId, fields, onDraftCountChange }, ref) {
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

    const updateField = useMutation({
      mutationFn: ({ fieldId, input }: { fieldId: string; input: UpdateFieldInput }) =>
        packApi.updateField(packId, fieldId, input),
      onSuccess: invalidate,
      onError: (err) => {
        const code = err instanceof ApiError ? err.code : 'UNKNOWN_ERROR';
        toast.error(`Failed to update field: ${code}`);
      },
    });

    const removeField = useMutation({
      mutationFn: (fieldId: string) => packApi.removeField(packId, fieldId),
      onSuccess: () => {
        toast.success('Field removed');
        invalidate();
      },
      onError: (err) => {
        const code = err instanceof ApiError ? err.code : 'UNKNOWN_ERROR';
        toast.error(`Failed to remove field: ${code}`);
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
          await packApi.addField(packId, {
            fieldKey: row.fieldKey,
            label: row.label,
            dataType: row.dataType,
            enumOptions: row.dataType === 'enum' ? parseOptions(row.enumOptionsText) : undefined,
            isRequired: row.isRequired,
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

    const isEmpty = fields.length === 0 && draftRows.length === 0;

    return (
      <div className="flex flex-col gap-4">
        {isEmpty ? (
          <div>
            <p className="text-sm font-semibold text-zinc-900">No fields yet</p>
            <p className="text-sm text-zinc-600">
              Add a field to start building this pack&apos;s data shape.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {fields.map((field, index) => (
              <div key={field.id}>
                {index > 0 && <Separator className="mb-4" />}
                <SavedFieldRow
                  field={field}
                  onUpdate={(input) => updateField.mutate({ fieldId: field.id, input })}
                  onRemove={() => removeField.mutate(field.id)}
                />
              </div>
            ))}
            {fields.length > 0 && draftRows.length > 0 && <Separator />}
            {draftRows.map((row, index) => (
              <div key={row.id}>
                {index > 0 && <Separator className="mb-4" />}
                <DraftFieldRow
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
            + Add Field
          </Button>
        </div>
      </div>
    );
  },
);

function SavedFieldRow({
  field,
  onUpdate,
  onRemove,
}: {
  field: PackFieldDefinition;
  onUpdate: (input: UpdateFieldInput) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-2">
        <Label>Key</Label>
        <Input value={field.fieldKey} disabled className="w-40" />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Label</Label>
        <Input
          defaultValue={field.label}
          className="w-48"
          onBlur={(e) => {
            if (e.target.value && e.target.value !== field.label) {
              onUpdate({ label: e.target.value });
            }
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Data Type</Label>
        <Select
          value={field.dataType}
          onValueChange={(value) => onUpdate({ dataType: value as CreateFieldInput['dataType'] })}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATA_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {field.dataType === 'enum' && (
        <div className="flex flex-col gap-2">
          <Label>Enum Options (comma-separated)</Label>
          <Input
            defaultValue={(field.enumOptions ?? []).join(', ')}
            className="w-64"
            onBlur={(e) => onUpdate({ enumOptions: parseOptions(e.target.value) })}
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        <Checkbox
          checked={field.isRequired}
          onCheckedChange={(checked) => onUpdate({ isRequired: checked === true })}
        />
        <Label>Required</Label>
      </div>
      <RemoveDefinitionButton title="Remove field" label={field.label} onConfirm={onRemove} />
    </div>
  );
}

function DraftFieldRow({
  form,
  index,
  onRemove,
}: {
  form: ReturnType<typeof useForm<DraftFormValues>>;
  index: number;
  onRemove: () => void;
}) {
  const dataType = form.watch(`rows.${index}.dataType`);
  const errors = form.formState.errors.rows?.[index];

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-2">
        <Label>Key</Label>
        <Input className="w-40" {...form.register(`rows.${index}.fieldKey`)} />
        {errors?.fieldKey && <p className="text-xs text-red-600">{errors.fieldKey.message}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label>Label</Label>
        <Input className="w-48" {...form.register(`rows.${index}.label`)} />
        {errors?.label && <p className="text-xs text-red-600">{errors.label.message}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label>Data Type</Label>
        <Select
          value={dataType}
          onValueChange={(value) =>
            form.setValue(`rows.${index}.dataType`, value as CreateFieldInput['dataType'])
          }
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATA_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {dataType === 'enum' && (
        <div className="flex flex-col gap-2">
          <Label>Enum Options (comma-separated)</Label>
          <Input className="w-64" {...form.register(`rows.${index}.enumOptionsText`)} />
          {errors?.enumOptionsText && (
            <p className="text-xs text-red-600">{errors.enumOptionsText.message}</p>
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Checkbox
          checked={form.watch(`rows.${index}.isRequired`)}
          onCheckedChange={(checked) => form.setValue(`rows.${index}.isRequired`, checked === true)}
        />
        <Label>Required</Label>
      </div>
      <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700" onClick={onRemove}>
        Remove
      </Button>
    </div>
  );
}

export function RemoveDefinitionButton({
  title,
  label,
  onConfirm,
}: {
  title: string;
  label: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700">
          Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            Remove &apos;{label}&apos;? Existing POI data isn&apos;t deleted, but this field/filter
            won&apos;t appear on POI forms until it&apos;s re-added.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700"
            onClick={onConfirm}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
