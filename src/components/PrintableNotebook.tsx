import type { MathfieldElement } from 'mathlive';
import type { DrawingElement, Page, Point } from '../domain/model';

function pathData(points: Point[], close = false): string {
  if (points.length === 0) return '';
  return `${points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ')}${close ? ' Z' : ''}`;
}

function drawingPath(drawing: DrawingElement): string {
  const start = drawing.points[0];
  const end = drawing.points.at(-1) ?? start;
  if (!start || !end) return '';
  if (drawing.kind === 'rectangle') {
    return `M${start.x},${start.y} L${end.x},${start.y} L${end.x},${end.y} L${start.x},${end.y} Z`;
  }
  if (drawing.kind === 'ellipse') {
    const rx = Math.abs(end.x - start.x) / 2;
    const ry = Math.abs(end.y - start.y) / 2;
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    return `M${cx - rx},${cy} A${rx},${ry} 0 1,0 ${cx + rx},${cy} A${rx},${ry} 0 1,0 ${cx - rx},${cy}`;
  }
  if (drawing.kind === 'perpendicular') {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.max(24, Math.hypot(dx, dy));
    const half = Math.max(20, length * .36);
    const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const normal = { x: -dy / length, y: dx / length };
    return `M${start.x},${start.y} L${end.x},${end.y} M${middle.x - normal.x * half},${middle.y - normal.y * half} L${middle.x + normal.x * half},${middle.y + normal.y * half}`;
  }
  return pathData(drawing.points, drawing.kind === 'polygon');
}

function PrintablePage({ page, pageNumber }: { page: Page; pageNumber: number }) {
  return <article className="printable-page" style={{ aspectRatio: `${page.width}/${page.height}` }}>
    {page.objects.map((object) => <div
      key={object.id}
      className={`printable-object printable-object--${object.type}`}
      style={{
        left: `${object.x / page.width * 100}%`,
        top: `${object.y / page.height * 100}%`,
        width: `${object.width / page.width * 100}%`,
        minHeight: `${object.height / page.height * 100}%`,
      }}
    >
      {object.type === 'text' && object.text}
      {object.type === 'math' && <math-field
        read-only="true"
        ref={(field: MathfieldElement | null) => {
          if (!field) return;
          field.value = object.latex;
          field.readOnly = true;
        }}
      />}
      {object.type === 'research' && <div className="printable-research">
        <strong>{object.snapshot.title}</strong>
        {object.snapshot.previewDataUrl && <img src={object.snapshot.previewDataUrl} alt="" />}
      </div>}
    </div>)}
    <svg className="printable-drawings" viewBox={`0 0 ${page.width} ${page.height}`} aria-hidden="true">
      {page.drawings.map((drawing) => {
        const maskId = `print-mask-${page.id}-${drawing.id}`.replace(/[^a-zA-Z0-9_-]/g, '');
        return <g key={drawing.id}>
          {drawing.erasures.length > 0 && <defs><mask id={maskId} maskUnits="userSpaceOnUse" x="-100%" y="-100%" width="300%" height="300%">
            <rect x="-100%" y="-100%" width="300%" height="300%" fill="white" />
            {drawing.erasures.map((erasure) => <path key={erasure.id} d={pathData(erasure.points)} fill="none" stroke="black" strokeWidth={erasure.width} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
          </mask></defs>}
          <path d={drawingPath(drawing)} mask={drawing.erasures.length ? `url(#${maskId})` : undefined} fill="none" stroke={drawing.color} strokeWidth={drawing.width} strokeOpacity={drawing.opacity} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </g>;
      })}
    </svg>
    <span className="printable-page-number">{pageNumber}</span>
  </article>;
}

export function PrintableNotebook({ pages, allPages }: { pages: Page[]; allPages: Page[] }) {
  return <section className="printable-notebook" aria-hidden="true">
    {pages.map((page) => <PrintablePage key={page.id} page={page} pageNumber={allPages.findIndex((candidate) => candidate.id === page.id) + 1} />)}
  </section>;
}
