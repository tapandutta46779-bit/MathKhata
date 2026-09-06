import { create } from 'zustand';
import type { PageObject } from '../domain/model';

// The unfinished ruled line is visible page content, even before Enter saves
// it. Keep this editor state separate from the persisted notebook schema.
export interface WritingDraft {
  notebookId: string;
  pageId: string;
  objects: PageObject[];
}

export const useWritingDraft = create<{ draft: WritingDraft | null }>(() => ({ draft: null }));

export function flushWritingDraft() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('mathnotebook:commit-writing'));
}
