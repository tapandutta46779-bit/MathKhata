import { z } from 'zod';
import { SCHEMA_VERSION, type MathKhataExport, type Notebook } from './model';

const dateSchema = z.string().datetime({ offset: true });
const coordinateSchema = z.number().finite().min(0).max(20_000);
const sizeSchema = z.number().finite().positive().max(20_000);

const baseObjectShape = {
  id: z.string().min(1).max(200),
  x: coordinateSchema,
  y: coordinateSchema,
  width: sizeSchema,
  height: sizeSchema,
  zIndex: z.number().int().min(0).max(1_000_000),
  createdAt: dateSchema,
  updatedAt: dateSchema,
};

export const mathObjectSchema = z
  .object({
    ...baseObjectShape,
    type: z.literal('math'),
    latex: z.string().max(100_000),
    editor: z
      .object({
        smartFence: z.boolean(),
        defaultMode: z.literal('math'),
      })
      .strict(),
  })
  .strict();

export const textObjectSchema = z
  .object({
    ...baseObjectShape,
    type: z.literal('text'),
    text: z.string().max(100_000),
  })
  .strict();

export const pageObjectSchema = z.discriminatedUnion('type', [mathObjectSchema, textObjectSchema]);

export const pageSchema = z
  .object({
    id: z.string().min(1).max(200),
    order: z.number().int().min(0).max(10_000),
    width: sizeSchema,
    height: sizeSchema,
    createdAt: dateSchema,
    updatedAt: dateSchema,
    objects: z.array(pageObjectSchema).max(10_000),
  })
  .strict();

export const notebookSchema = z
  .object({
    id: z.string().min(1).max(200),
    schemaVersion: z.literal(SCHEMA_VERSION),
    title: z.string().min(1).max(300),
    createdAt: dateSchema,
    updatedAt: dateSchema,
    pages: z.array(pageSchema).min(1).max(1_000),
  })
  .strict()
  .superRefine((notebook, context) => {
    const ids = new Set<string>();
    for (const page of notebook.pages) {
      if (ids.has(page.id)) {
        context.addIssue({ code: 'custom', message: `Duplicate id: ${page.id}` });
      }
      ids.add(page.id);
      for (const object of page.objects) {
        if (ids.has(object.id)) {
          context.addIssue({ code: 'custom', message: `Duplicate id: ${object.id}` });
        }
        ids.add(object.id);
      }
    }
  });

export const exportSchema = z
  .object({
    format: z.literal('mathkhata-notebook'),
    schemaVersion: z.literal(SCHEMA_VERSION),
    exportedAt: dateSchema,
    notebook: notebookSchema,
  })
  .strict();

export class NotebookValidationError extends Error {
  constructor(message: string, readonly details?: unknown) {
    super(message);
    this.name = 'NotebookValidationError';
  }
}

export function validateNotebook(value: unknown): Notebook {
  if (typeof value === 'object' && value !== null && 'schemaVersion' in value) {
    const version = (value as { schemaVersion?: unknown }).schemaVersion;
    if (version !== SCHEMA_VERSION) {
      throw new NotebookValidationError(
        `Unsupported notebook schema version ${String(version)}. This build supports version ${SCHEMA_VERSION}.`,
      );
    }
  }
  const result = notebookSchema.safeParse(value);
  if (!result.success) {
    throw new NotebookValidationError('Notebook data is malformed.', result.error.flatten());
  }
  return normalizeNotebook(result.data);
}

export function normalizeNotebook(notebook: Notebook): Notebook {
  return {
    ...notebook,
    pages: [...notebook.pages]
      .sort((a, b) => a.order - b.order)
      .map((page, order) => ({
        ...page,
        order,
        objects: page.objects.map((object) => ({
          ...object,
          x: Math.min(Math.max(0, object.x), Math.max(0, page.width - object.width)),
          y: Math.min(Math.max(0, object.y), Math.max(0, page.height - object.height)),
        })),
      })),
  };
}

export function serializeNotebook(notebook: Notebook): string {
  const validated = validateNotebook(notebook);
  const envelope: MathKhataExport = {
    format: 'mathkhata-notebook',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    notebook: validated,
  };
  return JSON.stringify(envelope, null, 2);
}

export function deserializeNotebook(json: string): Notebook {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (error) {
    throw new NotebookValidationError('The selected file is not valid JSON.', error);
  }
  const result = exportSchema.safeParse(parsed);
  if (!result.success) {
    throw new NotebookValidationError('This is not a valid MathKhata notebook export.', result.error.flatten());
  }
  return normalizeNotebook(result.data.notebook);
}

