import Dexie, { type EntityTable } from 'dexie';
import type { Notebook } from '../domain/model';
import { validateNotebook } from '../domain/schema';

export interface NotebookSummary {
  id: string;
  title: string;
  updatedAt: string;
  pageCount: number;
}

class MathKhataDatabase extends Dexie {
  notebooks!: EntityTable<Notebook, 'id'>;

  constructor(name = 'MathKhata') {
    super(name);
    this.version(1).stores({
      notebooks: 'id, updatedAt, title',
    });
  }
}

export const database = new MathKhataDatabase();

export async function saveNotebook(notebook: Notebook): Promise<void> {
  await database.notebooks.put(validateNotebook(notebook));
}

export async function loadNotebook(id: string): Promise<Notebook | null> {
  const stored = await database.notebooks.get(id);
  return stored ? validateNotebook(stored) : null;
}

export async function loadMostRecentNotebook(): Promise<Notebook | null> {
  const stored = await database.notebooks.orderBy('updatedAt').last();
  return stored ? validateNotebook(stored) : null;
}

export async function listNotebooks(): Promise<NotebookSummary[]> {
  const notebooks = await database.notebooks.orderBy('updatedAt').reverse().toArray();
  return notebooks.map((notebook) => ({
    id: notebook.id,
    title: notebook.title,
    updatedAt: notebook.updatedAt,
    pageCount: notebook.pages.length,
  }));
}

export async function hasNotebook(id: string): Promise<boolean> {
  return (await database.notebooks.get(id)) !== undefined;
}

export async function deleteStoredNotebook(id: string): Promise<void> {
  await database.notebooks.delete(id);
}

export function createTestDatabase(name: string): MathKhataDatabase {
  return new MathKhataDatabase(name);
}

