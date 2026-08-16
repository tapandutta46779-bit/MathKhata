import type { TextFontFamily, TextStyle } from './model';

export const DEFAULT_TEXT_STYLE: TextStyle = Object.freeze({
  fontFamily: 'handwriting',
  fontSize: 16,
  bold: false,
  italic: false,
  color: '#464239',
});

export const TEXT_FONT_OPTIONS: ReadonlyArray<{ value: TextFontFamily; label: string }> = Object.freeze([
  { value: 'handwriting', label: 'Handwriting' },
  { value: 'standard', label: 'Standard' },
  { value: 'roman', label: 'Roman serif' },
  { value: 'sans', label: 'Sans serif' },
  { value: 'monospace', label: 'Monospace' },
]);

export const TEXT_COLOR_PRESETS = Object.freeze([
  '#202020', '#7b2d26', '#1d4f91', '#24613b', '#6d3e91', '#b85c00',
]);

export const TEXT_FONT_STACKS: Record<TextFontFamily, string> = Object.freeze({
  handwriting: '"Bradley Hand", "Segoe Print", Georgia, serif',
  standard: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  roman: 'Georgia, "Times New Roman", Times, serif',
  sans: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  monospace: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
});

export function effectiveTextStyle(style?: TextStyle): TextStyle {
  return { ...DEFAULT_TEXT_STYLE, ...style };
}
