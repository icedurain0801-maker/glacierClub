import React from 'react'
import { Popover, Tag } from 'antd'

interface Props<T = string> {
  tags?: T[]
  data?: T[]
  mykey?: string
  showNum?: number
  renderItem?: boolean | ((item: T, index: number) => React.ReactNode)
}

function getDisplayValue(item: unknown) {
  if (React.isValidElement(item)) {
    return item
  }
  if (item == null) {
    return ''
  }
  if (typeof item === 'object') {
    const record = item as Record<string, unknown>
    return String(record.name ?? record.label ?? record.title ?? record.value ?? '')
  }
  return String(item)
}

export default function TagList<T = string>({ tags, data, mykey = 'tag-list', showNum, renderItem }: Props<T>) {
  const list = (data ?? tags ?? []).filter(item => item != null)
  const visibleList = typeof showNum === 'number' && showNum >= 0 ? list.slice(0, showNum) : list
  const hiddenList = typeof showNum === 'number' && showNum >= 0 ? list.slice(showNum) : []

  const renderTag = (item: T, index: number) => {
    const content = typeof renderItem === 'function' ? renderItem(item, index) : getDisplayValue(item)
    return (
      <Tag key={`${mykey}-${index}`} style={{ marginBottom: 4, maxWidth: 180, whiteSpace: 'normal' }}>
        {content}
      </Tag>
    )
  }

  return (
    <span>
      {visibleList.map(renderTag)}
      {hiddenList.length > 0 ? (
        <Popover content={<div style={{ maxWidth: 360 }}>{hiddenList.map(renderTag)}</div>}>
          <Tag color="blue" style={{ marginBottom: 4 }}>+{hiddenList.length}</Tag>
        </Popover>
      ) : null}
    </span>
  )
}
