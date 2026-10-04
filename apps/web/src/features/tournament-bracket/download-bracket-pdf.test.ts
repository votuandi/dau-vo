import { describe, expect, it, vi } from 'vitest';
import type { jsPDF } from 'jspdf';
import { drawBracketPdfConnectors } from './download-bracket-pdf';

describe('PDF bracket connectors', () => {
  it('rebuilds a missing SVG path from fixture positions when the chart is zoomed', () => {
    const chart = document.createElement('div');
    chart.innerHTML = `<article data-fixture-id="source"></article>
      <div data-fixture-slot="target:RED"></div>
      <svg data-bracket-connectors><path data-source-fixture="source" data-target-slot="target:RED" data-target-side="RED" /></svg>`;
    Object.defineProperty(chart, 'offsetWidth', { value: 500 });
    vi.spyOn(chart, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      width: 1000,
    } as DOMRect);
    const source = chart.querySelector<HTMLElement>('article');
    const target = chart.querySelector<HTMLElement>('[data-fixture-slot]');
    if (!source || !target) throw new Error('Missing fixtures');
    Object.defineProperties(source, {
      offsetParent: { value: chart },
      offsetLeft: { value: 0 },
      offsetTop: { value: 40 },
      offsetWidth: { value: 240 },
      offsetHeight: { value: 48 },
    });
    Object.defineProperties(target, {
      offsetParent: { value: chart },
      offsetLeft: { value: 264 },
      offsetTop: { value: 120 },
      offsetWidth: { value: 240 },
      offsetHeight: { value: 16 },
    });
    vi.spyOn(source, 'getBoundingClientRect').mockReturnValue({
      right: 490,
      top: 100,
      height: 96,
    } as DOMRect);
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
      left: 538,
      top: 260,
      height: 32,
    } as DOMRect);
    const pdf = { line: vi.fn(), setDrawColor: vi.fn(), setLineWidth: vi.fn() };
    drawBracketPdfConnectors(pdf as unknown as jsPDF, chart, 1, 16);
    expect(pdf.line).toHaveBeenCalledTimes(3);
    expect(pdf.line.mock.calls[0]?.slice(0, 2)).toEqual([256, 80]);
    expect(pdf.line.mock.calls[2]?.slice(2)).toEqual([280, 144]);
  });

  it('draws both incoming connections as three vector segments at the PDF scale', () => {
    const chart = document.createElement('div');
    chart.innerHTML = `<svg data-bracket-connectors>
      <path d="M 240 64 H 252 V 128 H 272" style="stroke: rgb(239, 68, 68); stroke-width: 2" />
      <path d="M 240 192 H 260 V 152 H 272" style="stroke: rgb(59, 130, 246); stroke-width: 2" />
    </svg>`;
    const pdf = { line: vi.fn(), setDrawColor: vi.fn(), setLineWidth: vi.fn() };
    drawBracketPdfConnectors(pdf as unknown as jsPDF, chart, 0.5, 16);
    expect(pdf.line.mock.calls).toEqual([
      [136, 48, 142, 48],
      [142, 48, 142, 80],
      [142, 80, 152, 80],
      [136, 112, 146, 112],
      [146, 112, 146, 92],
      [146, 92, 152, 92],
    ]);
    expect(pdf.setDrawColor.mock.calls).toEqual([
      [239, 68, 68],
      [59, 130, 246],
    ]);
    expect(pdf.setLineWidth).toHaveBeenCalledWith(1);
  });

  it('ignores unrelated SVG icons and invalid connector geometry', () => {
    const chart = document.createElement('div');
    chart.innerHTML =
      '<svg><path d="M 1 2 H 3 V 4 H 5" /></svg><svg data-bracket-connectors><path d="" /></svg>';
    const pdf = { line: vi.fn(), setDrawColor: vi.fn(), setLineWidth: vi.fn() };
    drawBracketPdfConnectors(pdf as unknown as jsPDF, chart, 1, 16);
    expect(pdf.line).not.toHaveBeenCalled();
  });
});
