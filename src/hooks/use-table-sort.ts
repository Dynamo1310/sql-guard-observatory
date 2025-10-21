import { useState, useMemo } from 'react';

export type SortDirection = 'asc' | 'desc' | null;

export interface SortConfig<T> {
  key: keyof T | null;
  direction: SortDirection;
}

export function useTableSort<T>(data: T[], initialKey?: keyof T) {
  const [sortConfig, setSortConfig] = useState<SortConfig<T>>({
    key: initialKey || null,
    direction: null,
  });

  const sortedData = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) {
      return data;
    }

    return [...data].sort((a, b) => {
      const aValue = a[sortConfig.key!];
      const bValue = b[sortConfig.key!];

      // Handle null/undefined values
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      // Handle numbers
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }

      // Handle dates (strings that can be parsed as dates)
      const aDate = new Date(aValue as any);
      const bDate = new Date(bValue as any);
      if (!isNaN(aDate.getTime()) && !isNaN(bDate.getTime())) {
        return sortConfig.direction === 'asc'
          ? aDate.getTime() - bDate.getTime()
          : bDate.getTime() - aDate.getTime();
      }

      // Handle strings (case-insensitive)
      const aString = String(aValue).toLowerCase();
      const bString = String(bValue).toLowerCase();

      if (aString < bString) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aString > bString) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [data, sortConfig]);

  const requestSort = (key: keyof T) => {
    let direction: SortDirection = 'asc';

    if (sortConfig.key === key) {
      if (sortConfig.direction === 'asc') {
        direction = 'desc';
      } else if (sortConfig.direction === 'desc') {
        direction = null;
      }
    }

    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key: keyof T) => {
    if (sortConfig.key !== key) {
      return null;
    }
    if (sortConfig.direction === 'asc') {
      return '↑';
    }
    if (sortConfig.direction === 'desc') {
      return '↓';
    }
    return null;
  };

  return {
    sortedData,
    requestSort,
    sortConfig,
    getSortIndicator,
  };
}

