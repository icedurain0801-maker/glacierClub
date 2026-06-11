import React from 'react'
import { Image } from 'antd'

interface Props {
  urls?: string[]
  data?: string[]
  showCount?: number
  size?: number
}

export default function ImagePreviewGroup({ urls, data, showCount, size = 60 }: Props) {
  const list = (urls ?? data ?? []).slice(0, showCount)

  return (
    <Image.PreviewGroup>
      {list.map((url, i) => (
        <Image key={i} src={url} width={size} height={size} style={{ objectFit: 'cover' }} />
      ))}
    </Image.PreviewGroup>
  )
}
