import React from 'react'
import { Form, Input } from 'antd'

export const FormOnlyVisiable = { Show: true, Hide: false } as const;

interface Props {
  label?: string
  name?: string
  children?: React.ReactNode
}

export default function Q1DataEntry({ label, name, children }: Props) {
  return (
    <Form.Item label={label} name={name}>
      {children || <Input />}
    </Form.Item>
  )
}
