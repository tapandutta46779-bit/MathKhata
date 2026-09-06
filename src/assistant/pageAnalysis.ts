import type { MathObject, PageObject, TextObject } from '../domain/model';
import type { NotebookContext } from '../extensions/providers';
import { WRITING_LINE_HEIGHT } from '../domain/writingFlow';

export interface PageAnalysisItem {
  object: PageObject;
  suspicious: boolean;
  issue?: string;
}

export type PageProblemKind = 'question' | 'system' | 'notes' | 'review';

export interface PageProblemGroup {
  id: string;
  kind: PageProblemKind;
  items: PageAnalysisItem[];
  confidence: number;
  needsReview: boolean;
  rationale: string;
  heading?: string;
}

export interface PageAnalysis {
  groups: PageProblemGroup[];
  orderedObjectIds: string[];
  reviewCount: number;
}

const PROBLEM_HEADING = /^\s*(?:(?:q(?:uestion)?|problem|exercise)\s*\d+|\d+[.)])\b/i;
const EXPLICIT_SEPARATOR = /^\s*(?:[-—=_]{3,}|(?:next|new)\s+(?:question|problem))\s*$/i;
const SYSTEM_CUE = /\b(?:system|simultaneous|together|same problem|solve (?:these|the) equations)\b/i;
const VOICE_PROSE = /(^|[^a-z])(?:why|then|what|where|because|remember|please)(?=$|[^a-z])/i;
const TEXT_PROBLEM = /\b(?:solve|evaluate|calculate|differentiate|integrate|simplify|prove|find|determine)\b|[=≤≥≠]|[a-z\d]\s*[+*/^]\s*[a-z\d]|\\(?:frac|sqrt|int|sum|lim)\b/i;

function ordered(objects: PageObject[]): PageObject[] {
  return [...objects].sort(
    (left, right) => left.y - right.y || left.x - right.x || left.zIndex - right.zIndex,
  );
}

export function readableMathText(latex: string): string {
  return latex
    .replace(/\\operatorname\{([^}]*)\}/g, '$1')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\(?:left|right|mathrm|mathbf|mathit|mathsf|mathtt)/g, '')
    .replace(/\\(?:times|cdot)/g, ' × ')
    .replace(/\\div/g, ' ÷ ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function voiceCorruptionIssue(latex: string): string | undefined {
  const readable = readableMathText(latex);
  if (VOICE_PROSE.test(readable)) {
    return 'This looks like speech text inside a Math line.';
  }
  const proseOperators = latex.match(/\\operatorname\{[^}]{3,}\}/g) ?? [];
  if (proseOperators.length >= 2) {
    return 'Several unrecognized spoken words were rendered as operators.';
  }
  return undefined;
}

function variables(latex: string): Set<string> {
  const withoutWords = latex
    .replace(/\\(?:operatorname|text)\{[^}]*\}/g, '')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/\b(?:sin|cos|tan|log|ln|exp)\b/g, '');
  return new Set((withoutWords.match(/[a-zA-Z]/g) ?? []).filter((name) => !['d', 'e', 'i'].includes(name)));
}

function intersects(left: Set<string>, right: Set<string>): boolean {
  return Array.from(left).some((name) => right.has(name));
}

function isEquation(object: MathObject): boolean {
  return object.latex.includes('=') && !object.latex.trim().endsWith('=');
}

function isHeading(object: PageObject): object is TextObject {
  return object.type === 'text' && (PROBLEM_HEADING.test(object.text) || EXPLICIT_SEPARATOR.test(object.text));
}

function makeItem(object: PageObject): PageAnalysisItem {
  const issue = object.type === 'math' ? voiceCorruptionIssue(object.latex) : undefined;
  return { object, suspicious: Boolean(issue), issue };
}

function groupId(items: PageAnalysisItem[], suffix = ''): string {
  return `page-group-${items.map((item) => item.object.id).join('-')}${suffix}`;
}

function averageY(items: PageAnalysisItem[]): number {
  return items.reduce((sum, item) => sum + item.object.y, 0) / Math.max(1, items.length);
}

function analyzeSection(section: PageAnalysisItem[]): PageProblemGroup[] {
  const cleanMath = section.filter(
    (item): item is PageAnalysisItem & { object: MathObject } =>
      item.object.type === 'math' && !item.suspicious,
  );
  const suspiciousMath = section.filter(
    (item): item is PageAnalysisItem & { object: MathObject } =>
      item.object.type === 'math' && item.suspicious,
  );
  const textItems = section.filter(
    (item): item is PageAnalysisItem & { object: TextObject } => item.object.type === 'text',
  );
  const sectionText = textItems.map((item) => item.object.text).join(' ');
  const explicitSystem = SYSTEM_CUE.test(sectionText);
  const heading = textItems.find((item) => PROBLEM_HEADING.test(item.object.text))?.object.text.trim();
  const parents = cleanMath.map((_, index) => index);
  const find = (index: number): number => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };

  for (let left = 0; left < cleanMath.length; left += 1) {
    for (let right = left + 1; right < cleanMath.length; right += 1) {
      const leftObject = cleanMath[left].object;
      const rightObject = cleanMath[right].object;
      const close = Math.abs(leftObject.y - rightObject.y) <= WRITING_LINE_HEIGHT * 3;
      if (!close) continue;
      if (explicitSystem || intersects(variables(leftObject.latex), variables(rightObject.latex))) {
        union(left, right);
      }
    }
  }

  const componentMap = new Map<number, PageAnalysisItem[]>();
  cleanMath.forEach((item, index) => {
    const root = find(index);
    componentMap.set(root, [...(componentMap.get(root) ?? []), item]);
  });
  const candidates: PageProblemGroup[] = Array.from(componentMap.values()).map((items) => {
    const equations = items.filter(
      (item): item is PageAnalysisItem & { object: MathObject } =>
        item.object.type === 'math' && isEquation(item.object),
    );
    const system = equations.length > 1;
    return {
      id: groupId(items),
      kind: system ? 'system' : 'question',
      items,
      confidence: system && !explicitSystem ? 0.7 : 0.9,
      needsReview: system && !explicitSystem,
      rationale: system
        ? explicitSystem
          ? 'Nearby equations are explicitly described as one system.'
          : 'Nearby equations share variables; confirm that they belong together.'
        : 'A single structured mathematical question was found.',
      heading,
    };
  });

  for (const item of suspiciousMath) {
    candidates.push({
      id: groupId([item], '-review'),
      kind: 'review',
      items: [item],
      confidence: 0.98,
      needsReview: true,
      rationale: item.issue ?? 'This Math line needs review before solving.',
      heading,
    });
  }

  if (candidates.length === 0 && textItems.length > 0) {
    const writtenProblem = TEXT_PROBLEM.test(sectionText);
    return [{
      id: groupId(textItems),
      kind: writtenProblem ? 'question' : 'notes',
      items: textItems,
      confidence: 0.92,
      needsReview: false,
      rationale: writtenProblem
        ? 'A problem written as text was found. AION can read the original wording.'
        : 'This section currently contains explanatory text only.',
      heading,
    }];
  }

  for (const text of textItems) {
    if (EXPLICIT_SEPARATOR.test(text.object.text)) continue;
    const closest = candidates.reduce<PageProblemGroup | null>((best, candidate) => {
      if (!best) return candidate;
      return Math.abs(text.object.y - averageY(candidate.items)) <
        Math.abs(text.object.y - averageY(best.items)) ? candidate : best;
    }, null);
    if (closest) closest.items.push(text);
  }

  const ambiguousIndependentQuestions = candidates.filter((group) => group.kind !== 'review').length > 1 && !heading;
  if (ambiguousIndependentQuestions) {
    for (const candidate of candidates) {
      if (candidate.kind === 'review') continue;
      candidate.confidence = Math.min(candidate.confidence, 0.76);
      candidate.needsReview = true;
      candidate.rationale = 'These nearby lines do not share variables; confirm that they are separate questions.';
    }
  }

  for (const candidate of candidates) candidate.items.sort((a, b) => a.object.y - b.object.y || a.object.x - b.object.x);
  return candidates.sort((a, b) => averageY(a.items) - averageY(b.items));
}

export function analyzeNotebookPage(context: NotebookContext): PageAnalysis {
  const objects = ordered(context.currentPage.objects.filter((object) =>
    object.type === 'math' ? object.latex.trim() : object.type === 'text' ? object.text.trim() : true,
  ));
  const sections: PageAnalysisItem[][] = [];
  let current: PageAnalysisItem[] = [];
  let previous: PageObject | null = null;
  for (const object of objects) {
    const startsExplicitProblem = isHeading(object) && current.length > 0;
    const largeGap = previous !== null && object.y - previous.y > WRITING_LINE_HEIGHT * 2.25;
    if ((startsExplicitProblem || largeGap) && current.length > 0) {
      sections.push(current);
      current = [];
    }
    current.push(makeItem(object));
    previous = object;
  }
  if (current.length > 0) sections.push(current);

  const groups = sections.flatMap(analyzeSection);
  return {
    groups,
    orderedObjectIds: objects.map((object) => object.id),
    reviewCount: groups.filter((group) => group.needsReview).length,
  };
}

export function splitProblemGroup(groups: PageProblemGroup[], groupIdToSplit: string): PageProblemGroup[] {
  const result: PageProblemGroup[] = [];
  for (const group of groups) {
    if (group.id !== groupIdToSplit) {
      result.push(group);
      continue;
    }
    const mathItems = group.items.filter((item) => item.object.type === 'math');
    const textItems = group.items.filter((item) => item.object.type === 'text');
    if (mathItems.length < 2) {
      result.push(group);
      continue;
    }
    const split = mathItems.map((item, index) => ({
      id: groupId([item], `-manual-${index}`),
      kind: item.suspicious ? ('review' as const) : ('question' as const),
      items: [item],
      confidence: 1,
      needsReview: item.suspicious,
      rationale: item.suspicious ? item.issue ?? 'Review this line.' : 'Separated manually.',
      heading: index === 0 ? group.heading : undefined,
    }));
    for (const text of textItems) {
      const closest = split.reduce((best, candidate) =>
        Math.abs(text.object.y - averageY(candidate.items)) < Math.abs(text.object.y - averageY(best.items))
          ? candidate
          : best,
      );
      closest.items.push(text);
    }
    result.push(...split);
  }
  return result;
}

export function joinProblemWithPrevious(groups: PageProblemGroup[], groupIdToJoin: string): PageProblemGroup[] {
  const index = groups.findIndex((group) => group.id === groupIdToJoin);
  if (index <= 0) return groups;
  const before = groups[index - 1];
  const current = groups[index];
  const items = [...before.items, ...current.items].sort(
    (left, right) => left.object.y - right.object.y || left.object.x - right.object.x,
  );
  const math = items.filter(
    (item): item is PageAnalysisItem & { object: MathObject } => item.object.type === 'math',
  );
  const joined: PageProblemGroup = {
    id: groupId(items, '-manual-join'),
    kind: math.length > 1 && math.every((item) => isEquation(item.object)) ? 'system' : 'question',
    items,
    confidence: 1,
    needsReview: items.some((item) => item.suspicious),
    rationale: 'Grouped together manually.',
    heading: before.heading ?? current.heading,
  };
  return [...groups.slice(0, index - 1), joined, ...groups.slice(index + 1)];
}

export function confirmProblemGroup(groups: PageProblemGroup[], groupIdToConfirm: string): PageProblemGroup[] {
  return groups.map((group) => group.id === groupIdToConfirm
    ? { ...group, confidence: 1, needsReview: group.items.some((item) => item.suspicious), rationale: 'Grouping confirmed manually.' }
    : group);
}
