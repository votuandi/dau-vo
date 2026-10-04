import type { jsPDF } from 'jspdf';
import { bracketConnectorPath, bracketElementBounds } from './bracket-chart-layout';

// Draw connectors as PDF vectors: nested SVG paths can disappear when the DOM
// screenshot is rendered through an SVG foreignObject.
export function drawBracketPdfConnectors(
  pdf: jsPDF,
  chart: HTMLElement,
  scale: number,
  margin: number,
) {
  chart.querySelectorAll<SVGPathElement>('[data-bracket-connectors] path').forEach((path) => {
    let geometry = path.getAttribute('d') ?? '';
    const source = Array.from(chart.querySelectorAll<HTMLElement>('[data-fixture-id]')).find(
      (element) => element.dataset.fixtureId === path.dataset.sourceFixture,
    );
    const target = Array.from(chart.querySelectorAll<HTMLElement>('[data-fixture-slot]')).find(
      (element) => element.dataset.fixtureSlot === path.dataset.targetSlot,
    );
    if (source && target) {
      const sourceBounds = bracketElementBounds(source, chart);
      const targetBounds = bracketElementBounds(target, chart);
      geometry = bracketConnectorPath({
        sourceRight: sourceBounds.right,
        sourceCenterY: sourceBounds.centerY,
        targetLeft: targetBounds.left,
        targetCenterY: targetBounds.centerY,
        targetSide: path.dataset.targetSide === 'RED' ? 'RED' : 'BLUE',
      });
    }
    const coordinates = /^M ([\d.e+-]+) ([\d.e+-]+) H ([\d.e+-]+) V ([\d.e+-]+) H ([\d.e+-]+)$/i
      .exec(geometry)
      ?.slice(1)
      .map(Number);
    if (!coordinates || coordinates.some((value) => !Number.isFinite(value))) return;
    const [startX, startY, middleX, endY, endX] = coordinates;
    if (
      startX === undefined ||
      startY === undefined ||
      middleX === undefined ||
      endY === undefined ||
      endX === undefined
    )
      return;
    const style = getComputedStyle(path);
    const color = style.stroke
      .match(/[\d.]+/g)
      ?.slice(0, 3)
      .map(Number);
    const [red, green, blue] = color ?? [];
    if (red !== undefined && green !== undefined && blue !== undefined)
      pdf.setDrawColor(red, green, blue);
    else pdf.setDrawColor('#64748b');
    pdf.setLineWidth((Number.parseFloat(style.strokeWidth) || 2) * scale);
    pdf.line(
      margin + startX * scale,
      margin + startY * scale,
      margin + middleX * scale,
      margin + startY * scale,
    );
    pdf.line(
      margin + middleX * scale,
      margin + startY * scale,
      margin + middleX * scale,
      margin + endY * scale,
    );
    pdf.line(
      margin + middleX * scale,
      margin + endY * scale,
      margin + endX * scale,
      margin + endY * scale,
    );
  });
}

export async function downloadBracketPdf(container: HTMLElement, filename: string): Promise<void> {
  const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  await (document as Partial<Document>).fonts?.ready;
  const wasHidden = container.hidden;
  container.hidden = false;
  try {
    // Allow the chart's ResizeObserver and connector measurements to settle.
    for (let frame = 0; frame < 4; frame++) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => {
          resolve();
        }),
      );
    }
    const chart = container.querySelector<HTMLElement>('[data-bracket-content]');
    if (!chart) throw new Error('Không tìm thấy sơ đồ nhánh đấu.');
    const width = chart.scrollWidth;
    const height = chart.scrollHeight;
    const image = await toPng(chart, {
      backgroundColor:
        getComputedStyle(container).backgroundColor === 'rgba(0, 0, 0, 0)'
          ? getComputedStyle(document.body).backgroundColor
          : getComputedStyle(container).backgroundColor,
      width,
      height,
      style: { zoom: '1' },
      pixelRatio: Math.min(2, 16000 / Math.max(width, height)),
      filter: (node) =>
        !(
          node instanceof Element &&
          (node.tagName === 'BUTTON' || node.hasAttribute('data-bracket-connectors'))
        ),
    });
    const margin = 16;
    const scale = Math.min(1, 14000 / Math.max(width, height));
    const pdf = new jsPDF({
      orientation: width >= height ? 'landscape' : 'portrait',
      unit: 'pt',
      format: [width * scale + margin * 2, height * scale + margin * 2],
      compress: true,
    });
    pdf.addImage(image, 'PNG', margin, margin, width * scale, height * scale);
    drawBracketPdfConnectors(pdf, chart, scale, margin);
    const safeFilename = Array.from(filename, (character) =>
      character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? '-' : character,
    )
      .join('')
      .trim();
    await pdf.save(`${safeFilename || 'bracket'}.pdf`, { returnPromise: true });
  } finally {
    container.hidden = wasHidden;
  }
}
