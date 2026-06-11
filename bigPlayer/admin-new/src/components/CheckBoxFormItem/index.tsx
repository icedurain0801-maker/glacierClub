import { Checkbox } from 'antd'
import React from 'react'

interface Props {
  value?: number
  onChange?: (val: number) => void
  min?: number
  max?: number
  children?: React.ReactNode
}

export default function CheckBoxNumber({ value, onChange, min = 0, max = 1, children }: Props) {
  return (
    <Checkbox
      checked={!!value}
      onChange={(e) => onChange?.(e.target.checked ? (max || 1) : min)}
    >
      {children}
    </Checkbox>
  )
}
