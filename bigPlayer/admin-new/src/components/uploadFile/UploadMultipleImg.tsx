import React from 'react'
import { Upload } from 'antd'
import { PlusOutlined } from '@ant-design/icons'

interface Props {
  value?: string[]
  onChange?: (val: string[]) => void
  maxCount?: number
}

export default function UploadMultipleImg({ value = [], onChange, maxCount = 9 }: Props) {
  return (
    <Upload listType="picture-card" multiple maxCount={maxCount}>
      <PlusOutlined />
    </Upload>
  )
}
