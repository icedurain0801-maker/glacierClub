import React from 'react'
import { Upload, Button } from 'antd'
import { UploadOutlined } from '@ant-design/icons'

interface Props {
  onRead?: (data: unknown[]) => void
}

export default function ReadFile({ onRead }: Props) {
  return (
    <Upload
      accept=".xlsx,.xls"
      showUploadList={false}
      beforeUpload={() => false}
    >
      <Button icon={<UploadOutlined />}>导入文件</Button>
    </Upload>
  )
}
