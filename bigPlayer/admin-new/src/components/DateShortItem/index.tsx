import React from 'react'
import { DatePicker } from 'antd'
import type { DatePickerProps } from 'antd'

export default function DateShortItem(props: DatePickerProps) {
  return <DatePicker {...props} />
}
