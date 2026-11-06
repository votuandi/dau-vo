import { ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MIN_ZOOM_PERCENT = 50;
const MAX_ZOOM_PERCENT = 200;
const ZOOM_STEP_PERCENT = 10;

/** Zoom-out / zoom-in icon buttons for the bracket chart, clamped to 50–200%. */
export function BracketZoomControls({
  zoomPercent,
  onChange,
  disabled = false,
}: {
  readonly zoomPercent: number;
  readonly onChange: (zoomPercent: number) => void;
  readonly disabled?: boolean;
}) {
  return (
    <>
      <Button
        aria-label="Thu nhỏ"
        title="Thu nhỏ"
        disabled={disabled || zoomPercent <= MIN_ZOOM_PERCENT}
        onClick={() => {
          onChange(Math.max(MIN_ZOOM_PERCENT, zoomPercent - ZOOM_STEP_PERCENT));
        }}
        className="size-8 [&_svg]:size-3.5"
        size="icon-sm"
        type="button"
        variant="outline"
      >
        <ZoomOut aria-hidden="true" />
      </Button>
      <Button
        aria-label="Phóng to"
        title="Phóng to"
        disabled={disabled || zoomPercent >= MAX_ZOOM_PERCENT}
        onClick={() => {
          onChange(Math.min(MAX_ZOOM_PERCENT, zoomPercent + ZOOM_STEP_PERCENT));
        }}
        className="size-8 [&_svg]:size-3.5"
        size="icon-sm"
        type="button"
        variant="outline"
      >
        <ZoomIn aria-hidden="true" />
      </Button>
    </>
  );
}
