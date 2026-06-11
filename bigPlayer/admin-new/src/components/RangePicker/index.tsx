import React from 'react'
import { DatePicker } from 'antd'
import type { RangePickerProps } from 'antd/es/date-picker'

export default function RangePicker(props: RangePickerProps) {
  return <DatePicker.RangePicker {...props} />
}
