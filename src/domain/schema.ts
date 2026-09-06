import { z } from 'zod';
import { SCHEMA_VERSION, type MathKhataExport, type Notebook, type ResearchValue } from './model';

const dateSchema = z.string().datetime({ offset: true });
const coordinateSchema = z.number().finite().min(0).max(20_000);
const sizeSchema = z.number().finite().positive().max(20_000);
const drawingPointSchema = z.object({ x: coordinateSchema, y: coordinateSchema }).strict();
const researchValueSchema: z.ZodType<ResearchValue> = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number().finite(), z.string().max(8_000_000),
  z.array(researchValueSchema).max(100_000),
  z.record(z.string().max(300), researchValueSchema),
]));

const drawingErasureSchema = z.object({
  id: z.string().min(1).max(200),
  width: z.number().finite().min(1).max(240),
  points: z.array(drawingPointSchema).min(1).max(20_000),
  createdAt: dateSchema,
}).strict();

export const drawingElementSchema = z.object({
  id: z.string().min(1).max(200),
  kind: z.enum(['pen', 'highlighter', 'line', 'arrow', 'rectangle', 'ellipse', 'polygon', 'perpendicular']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  width: z.number().finite().min(0.5).max(80),
  opacity: z.number().finite().min(0.05).max(1),
  points: z.array(drawingPointSchema).min(2).max(20_000),
  erasures: z.array(drawingErasureSchema).max(10_000),
  createdAt: dateSchema,
  updatedAt: dateSchema,
}).strict();

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
    style: z.object({
      fontFamily: z.enum(['handwriting', 'standard', 'roman', 'sans', 'monospace']),
      fontSize: z.number().finite().min(10).max(72),
      bold: z.boolean(),
      italic: z.boolean(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    }).strict().optional(),
  })
  .strict();

export const researchObjectSchema = z.object({
  ...baseObjectShape,
  type: z.literal('research'),
  snapshot: z.object({
    kind: z.enum(['2d', 'loglog', '3d', 'geometry', 'geometry3d']),
    title: z.string().min(1).max(200),
    values: z.record(z.string().max(300), researchValueSchema),
    previewDataUrl: z.string().max(8_000_000).nullable(),
  }).strict(),
}).strict();

export const pageObjectSchema = z.discriminatedUnion('type', [mathObjectSchema, textObjectSchema, researchObjectSchema]);

export const pageSchema = z
  .object({
    id: z.string().min(1).max(200),
    order: z.number().int().min(0).max(10_000),
    width: sizeSchema,
    height: sizeSchema,
    createdAt: dateSchema,
    updatedAt: dateSchema,
    objects: z.array(pageObjectSchema).max(10_000),
    drawings: z.array(drawingElementSchema).max(20_000),
    favorite: z.boolean(),
    highlightColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
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
    research: z.object({ values: z.record(z.string().max(300), researchValueSchema) }).strict(),
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
      for (const drawing of page.drawings) {
        if (ids.has(drawing.id)) {
          context.addIssue({ code: 'custom', message: `Duplicate id: ${drawing.id}` });
        }
        ids.add(drawing.id);
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

type NotebookMigration = (value: Record<string, unknown>) => Record<string, unknown>;

// A migration registered at key N transforms schema N into schema N + 1.
const notebookMigrations: Partial<Record<number, NotebookMigration>> = Object.freeze({
  1: (value: Record<string, unknown>) => ({
    ...value,
    schemaVersion: 2,
    pages: Array.isArray(value.pages)
      ? value.pages.map((page: unknown) => (
        typeof page === 'object' && page !== null
          ? { ...page, drawings: [] }
          : page
      ))
      : value.pages,
  }),
  2: (value: Record<string, unknown>) => ({
    ...value,
    schemaVersion: 3,
    research: { values: {} },
    pages: Array.isArray(value.pages)
      ? value.pages.map((page: unknown) => (
        typeof page === 'object' && page !== null
          ? {
            ...page,
            favorite: false,
            highlightColor: null,
            drawings: Array.isArray((page as { drawings?: unknown }).drawings)
              ? ((page as { drawings: unknown[] }).drawings).map((drawing) => (
                typeof drawing === 'object' && drawing !== null ? { ...drawing, erasures: [] } : drawing
              ))
              : [],
          }
          : page
      ))
      : value.pages,
  }),
});

export function migrateNotebook(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('schemaVersion' in value)) return value;
  const version = (value as { schemaVersion?: unknown }).schemaVersion;
  if (!Number.isInteger(version)) return value;
  if ((version as number) > SCHEMA_VERSION) {
    throw new NotebookValidationError(
      `Unsupported notebook schema version ${String(version)}. This build supports version ${SCHEMA_VERSION}.`,
    );
  }
  let migrated = value as Record<string, unknown>;
  let currentVersion = version as number;
  while (currentVersion < SCHEMA_VERSION) {
    const migrate = notebookMigrations[currentVersion];
    if (!migrate) {
      throw new NotebookValidationError(
        `Notebook schema version ${currentVersion} has no safe migration to version ${currentVersion + 1}.`,
      );
    }
    migrated = migrate(migrated);
    currentVersion += 1;
  }
  return migrated;
}

export function validateNotebook(value: unknown): Notebook {
  assertSafeTree(value);
  const migrated = migrateNotebook(value);
  const result = notebookSchema.safeParse(migrated);
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
        drawings: page.drawings.map((drawing) => ({
          ...drawing,
          points: drawing.points.map((point) => ({
            x: Math.min(Math.max(0, point.x), page.width),
            y: Math.min(Math.max(0, point.y), page.height),
          })),
          erasures: drawing.erasures.map((erasure) => ({
            ...erasure,
            points: erasure.points.map((point) => ({
              x: Math.min(Math.max(0, point.x), page.width),
              y: Math.min(Math.max(0, point.y), page.height),
            })),
          })),
        })),
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
  if (json.length > MAX_IMPORT_BYTES) throw new NotebookValidationError('Import exceeds the 64 MB safety limit.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (error) {
    throw new NotebookValidationError('The selected file is not valid JSON.', error);
  }
  const envelope = z.object({
    format: z.literal('mathkhata-notebook'),
    schemaVersion: z.number().int().min(1),
    exportedAt: dateSchema,
    notebook: z.unknown(),
  }).strict().safeParse(parsed);
  if (!envelope.success) {
    throw new NotebookValidationError('This is not a valid Math Notebook export.', envelope.error.flatten());
  }
  if (envelope.data.schemaVersion !== (envelope.data.notebook as { schemaVersion?: unknown })?.schemaVersion) {
    throw new NotebookValidationError('The notebook export has conflicting schema versions.');
  }
  return validateNotebook(envelope.data.notebook);
}

export const MAX_IMPORT_BYTES = 64 * 1024 * 1024;

function assertSafeTree(value: unknown): void {
  const stack = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const item = stack.pop()!;
    if (++nodes > 500_000 || item.depth > 64) {
      throw new NotebookValidationError('Notebook data exceeds safe structural limits.');
    }
    if (item.value && typeof item.value === 'object') {
      for (const [key, child] of Object.entries(item.value)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) {
          throw new NotebookValidationError('Notebook contains an unsafe property name.');
        }
        stack.push({ value: child, depth: item.depth + 1 });
      }
    }
  }
}
