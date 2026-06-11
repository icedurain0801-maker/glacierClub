import React from 'react'

interface Props {
  title?: string
  children?: React.ReactNode
}

export default function BlockHeader({ title, children }: Props) {
  return (
    <div style={{ marginBottom: 16 }}>
      {title && <h3 style={{ margin: 0 }}>{title}</h3>}
      {children}
    </div>
  )
}
