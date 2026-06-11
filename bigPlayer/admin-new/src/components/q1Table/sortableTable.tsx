import React from 'react'
import { Table } from 'antd'
import type { TableProps } from 'antd'

interface Props<T> extends TableProps<T> {
  onSortEnd?: (oldIndex: number, newIndex: number) => void
  onChangeSort?: (value: { oldIndex: number; newIndex: number }) => void
  helperClass?: string
}

export default function SortableTable<T extends object>({ onSortEnd, onChangeSort, helperClass, ...props }: Props<T>) {
  return <Table {...props} />
}
