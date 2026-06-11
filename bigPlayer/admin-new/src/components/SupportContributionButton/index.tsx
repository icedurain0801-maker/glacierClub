import React from 'react'
import { Button } from 'antd'

interface Props {
  onClick?: () => void
  disabled?: boolean
}

export default function SupportContributionButton({ onClick, disabled }: Props) {
  return (
    <Button size="small" onClick={onClick} disabled={disabled}>
      支持贡献
    </Button>
  )
}
