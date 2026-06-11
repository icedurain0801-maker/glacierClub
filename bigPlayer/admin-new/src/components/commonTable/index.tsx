import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Table } from 'antd';
import type { TableProps } from 'antd';

type PaginationState = {
  pageIndex: number;
  pageSize: number;
  total: number;
};

export interface CommonTableRef {
  reload: () => void;
  refresh: () => void;
  setPagination: (pagination: Partial<PaginationState>) => void;
}

export function useCommonTableRef<T = any>() {
  return useRef<CommonTableRef>(null);
}

interface ApiResult<T> {
  data?: T[];
  total?: number;
  pageIndex?: number;
  pageSize?: number;
}

interface Props<T> extends Omit<TableProps<T>, 'children'> {
  api?: (pagination: PaginationState) => Promise<ApiResult<T>>;
  children?: (payload: { data: T[]; equaledTableProps: any }) => React.ReactNode;
  onReload?: () => void;
  refreshDisabled?: boolean;
}

const defaultPagination: PaginationState = {
  pageIndex: 1,
  pageSize: 20,
  total: 0,
};

function CommonTable<T extends object>(props: Props<T>, ref: React.Ref<CommonTableRef>) {
  const { api, children, onReload, refreshDisabled, dataSource, pagination: paginationProp, ...tableProps } = props;
  const [data, setData] = useState<T[]>(() => (Array.isArray(dataSource) ? dataSource : []));
  const [loading, setLoading] = useState(false);
  const [pagination, setPaginationState] = useState<PaginationState>(() => ({
    ...defaultPagination,
    total: Array.isArray(dataSource) ? dataSource.length : 0,
  }));
  const paginationRef = useRef(pagination);

  const setPagination = useCallback((next: Partial<PaginationState>) => {
    paginationRef.current = { ...paginationRef.current, ...next };
    setPaginationState(paginationRef.current);
  }, []);

  const load = useCallback(
    async (nextPagination?: Partial<PaginationState>) => {
      const next = { ...paginationRef.current, ...nextPagination };

      if (!api || refreshDisabled) {
        onReload?.();
        return;
      }

      setLoading(true);
      try {
        const result = await api(next);
        const nextData = result?.data || [];
        setData(nextData);
        setPagination({
          pageIndex: result?.pageIndex ?? next.pageIndex,
          pageSize: result?.pageSize ?? next.pageSize,
          total: result?.total ?? nextData.length,
        });
      } finally {
        setLoading(false);
      }
    },
    [api, onReload, refreshDisabled, setPagination]
  );

  useImperativeHandle(
    ref,
    () => ({
      reload: () => load({ pageIndex: 1 }),
      refresh: () => load({ pageIndex: 1 }),
      setPagination,
    }),
    [load, setPagination]
  );

  useEffect(() => {
    if (Array.isArray(dataSource) && !api) {
      setData(dataSource);
      setPagination({ total: dataSource.length });
    }
  }, [api, dataSource, setPagination]);

  useEffect(() => {
    if (api && !refreshDisabled) {
      load({ pageIndex: 1 });
    }
  }, [api, load, refreshDisabled]);

  const mergedTableProps = useMemo(() => {
    const handleChange: TableProps<T>['onChange'] = nextPagination => {
      const next = {
        pageIndex: nextPagination.current || 1,
        pageSize: nextPagination.pageSize || paginationRef.current.pageSize,
        total: paginationRef.current.total,
      };
      setPagination(next);
      load(next);
    };

    return {
      ...tableProps,
      loading: tableProps.loading ?? loading,
      dataSource: data,
      pagination:
        paginationProp === false
          ? false
          : {
              showSizeChanger: true,
              ...(typeof paginationProp === 'object' ? paginationProp : {}),
              current: pagination.pageIndex,
              pageSize: pagination.pageSize,
              total: pagination.total,
              onChange: (current: number, pageSize: number) => handleChange({ current, pageSize } as any, {}, {} as any, {} as any),
            },
      onChange: handleChange,
    };
  }, [data, load, loading, pagination, paginationProp, setPagination, tableProps]);

  if (typeof children === 'function') {
    return <>{children({ data, equaledTableProps: mergedTableProps })}</>;
  }

  return <Table<T> {...mergedTableProps} />;
}

export default forwardRef(CommonTable) as <T extends object>(
  props: Props<T> & { ref?: React.Ref<CommonTableRef> }
) => React.ReactElement;
