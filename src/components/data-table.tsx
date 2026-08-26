'use client';

import { useState, useCallback } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState } from './empty-state';
import { LoadingSkeleton } from './loading';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  width?: string;
  render?: (item: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyIcon?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (key: string, order: 'asc' | 'desc') => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  getRowId?: (item: T) => string;
  onRowClick?: (item: T) => void;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  bulkActions?: React.ReactNode;
}

export function DataTable<T>({
  columns,
  data,
  loading,
  emptyIcon,
  emptyTitle = 'No data found',
  emptyDescription,
  emptyAction,
  sortBy,
  sortOrder,
  onSort,
  selectable,
  selectedIds = new Set(),
  onSelectionChange,
  getRowId = (item: T) => (item as Record<string, string>).id,
  onRowClick,
  page = 1,
  pageSize = 25,
  total = 0,
  onPageChange,
  bulkActions,
}: DataTableProps<T>) {
  const totalPages = Math.ceil(total / pageSize);

  const handleSelectAll = useCallback(() => {
    if (!onSelectionChange) return;
    const allIds = data.map(getRowId);
    const allSelected = allIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      const next = new Set(selectedIds);
      allIds.forEach((id) => next.delete(id));
      onSelectionChange(next);
    } else {
      const next = new Set(selectedIds);
      allIds.forEach((id) => next.add(id));
      onSelectionChange(next);
    }
  }, [data, getRowId, onSelectionChange, selectedIds]);

  const handleSelectRow = useCallback(
    (id: string) => {
      if (!onSelectionChange) return;
      const next = new Set(selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      onSelectionChange(next);
    },
    [onSelectionChange, selectedIds]
  );

  const handleSort = (key: string) => {
    if (!onSort) return;
    if (sortBy === key) {
      onSort(key, sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      onSort(key, 'desc');
    }
  };

  const allSelected = data.length > 0 && data.every((item) => selectedIds.has(getRowId(item)));
  const someSelected = data.some((item) => selectedIds.has(getRowId(item)));

  if (loading) {
    return (
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-800 bg-surface-900/50">
                {selectable && <th className="table-header w-12"></th>}
                {columns.map((col) => (
                  <th key={col.key} className="table-header" style={{ width: col.width }}>
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-surface-800">
                  {selectable && (
                    <td className="table-cell">
                      <div className="skeleton w-4 h-4 rounded" />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className="table-cell">
                      <div className="skeleton h-4 w-3/4 rounded" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Bulk action bar */}
      {selectedIds.size > 0 && bulkActions && (
        <div className="bg-primary-600/10 border border-primary-500/20 rounded-t-xl px-4 py-3 flex items-center gap-4">
          <span className="text-sm text-primary-300 font-medium">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-2">{bulkActions}</div>
          <button
            onClick={() => onSelectionChange?.(new Set())}
            className="ml-auto text-xs text-surface-400 hover:text-white"
          >
            Clear selection
          </button>
        </div>
      )}

      <div className={`card p-0 overflow-hidden ${selectedIds.size > 0 && bulkActions ? 'rounded-t-none' : ''}`}>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-800 bg-surface-900/50">
                {selectable && (
                  <th className="table-header w-12">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected && !allSelected;
                      }}
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-primary-600 focus:ring-primary-500 focus:ring-offset-0"
                    />
                  </th>
                )}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`table-header ${col.sortable ? 'cursor-pointer select-none hover:text-surface-200' : ''}`}
                    style={{ width: col.width }}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.header}
                      {col.sortable && (
                        <span className="inline-flex flex-col">
                          {sortBy === col.key ? (
                            sortOrder === 'asc' ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )
                          ) : (
                            <ChevronsUpDown className="w-3.5 h-3.5 opacity-40" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((item, idx) => {
                const id = getRowId(item);
                const isSelected = selectedIds.has(id);
                return (
                  <tr
                    key={id}
                    className={`table-row ${idx % 2 === 1 ? 'bg-surface-900/30' : ''} ${
                      isSelected ? 'bg-primary-600/5' : ''
                    } ${onRowClick ? 'cursor-pointer' : ''}`}
                    onClick={() => onRowClick?.(item)}
                  >
                    {selectable && (
                      <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectRow(id)}
                          className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-primary-600 focus:ring-primary-500 focus:ring-offset-0"
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td key={col.key} className="table-cell">
                        {col.render
                          ? col.render(item)
                          : String((item as Record<string, unknown>)[col.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-surface-800">
            <p className="text-sm text-surface-400">
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of{' '}
              {total.toLocaleString()} results
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onPageChange?.(page - 1)}
                disabled={page <= 1}
                className="btn-ghost btn-sm"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {generatePageNumbers(page, totalPages).map((p, i) =>
                p === '...' ? (
                  <span key={`dots-${i}`} className="px-2 text-surface-500">
                    ...
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => onPageChange?.(p as number)}
                    className={`btn-sm rounded-lg min-w-[2rem] ${
                      p === page
                        ? 'bg-primary-600 text-white'
                        : 'text-surface-400 hover:text-white hover:bg-surface-800'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                onClick={() => onPageChange?.(page + 1)}
                disabled={page >= totalPages}
                className="btn-ghost btn-sm"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function generatePageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | string)[] = [];
  if (current <= 4) {
    for (let i = 1; i <= 5; i++) pages.push(i);
    pages.push('...');
    pages.push(total);
  } else if (current >= total - 3) {
    pages.push(1);
    pages.push('...');
    for (let i = total - 4; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    pages.push('...');
    for (let i = current - 1; i <= current + 1; i++) pages.push(i);
    pages.push('...');
    pages.push(total);
  }
  return pages;
}
