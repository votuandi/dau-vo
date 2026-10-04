import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationProps {
  readonly page: number;
  readonly totalPages: number;
  readonly onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  const lastPage = Math.max(1, totalPages);
  const currentPage = Math.min(Math.max(1, page), lastPage);
  const start = Math.max(1, Math.min(currentPage - 1, lastPage - 2));
  const pages = [...new Set([1, start, start + 1, start + 2, lastPage])]
    .filter((value) => value <= lastPage)
    .sort((a, b) => a - b);
  const buttonClass =
    'inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-gray-100 bg-white text-xs font-medium text-gray-600 shadow-sm transition-colors hover:border-gray-200 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-default disabled:text-gray-300 disabled:hover:border-gray-100 disabled:hover:bg-white';

  return (
    <nav aria-label="Phân trang" className="flex w-full items-center justify-center gap-1">
      <button
        aria-label="Trang đầu"
        className={buttonClass}
        disabled={currentPage === 1}
        onClick={() => {
          onPageChange(1);
        }}
        type="button"
      >
        <ChevronsLeft aria-hidden="true" className="size-3.5" />
      </button>
      <button
        aria-label="Trang trước"
        className={buttonClass}
        disabled={currentPage === 1}
        onClick={() => {
          onPageChange(currentPage - 1);
        }}
        type="button"
      >
        <ChevronLeft aria-hidden="true" className="size-3.5" />
      </button>
      {pages.map((value, index) => (
        <span className="contents" key={value}>
          {index > 0 && value - (pages[index - 1] ?? value) > 1 ? (
            <span
              aria-hidden="true"
              className="flex size-7 items-center justify-center text-xs text-gray-500"
            >
              …
            </span>
          ) : null}
          <button
            aria-current={value === currentPage ? 'page' : undefined}
            aria-label={`Trang ${String(value)}`}
            className={cn(
              buttonClass,
              value === currentPage &&
                'border-blue-500 bg-blue-500 text-white hover:border-blue-600 hover:bg-blue-600',
            )}
            onClick={() => {
              onPageChange(value);
            }}
            type="button"
          >
            {value}
          </button>
        </span>
      ))}
      <button
        aria-label="Trang sau"
        className={buttonClass}
        disabled={currentPage === lastPage}
        onClick={() => {
          onPageChange(currentPage + 1);
        }}
        type="button"
      >
        <ChevronRight aria-hidden="true" className="size-3.5" />
      </button>
      <button
        aria-label="Trang cuối"
        className={buttonClass}
        disabled={currentPage === lastPage}
        onClick={() => {
          onPageChange(lastPage);
        }}
        type="button"
      >
        <ChevronsRight aria-hidden="true" className="size-3.5" />
      </button>
    </nav>
  );
}
