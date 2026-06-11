import { Button, Space } from 'antd';
import type { ButtonProps } from 'antd';
import { CSSProperties } from 'react';

export interface ActionBtn {
  title?: string;
  icon?: string;
  hidden?: boolean;
  props: Partial<ButtonProps> & { children?: React.ReactNode };
}

interface ActionGroupProps {
  className?: string;
  style?: CSSProperties;
  btns: Array<ActionBtn | null | undefined | false>;
}

export default function ActionGroup({ className, style, btns }: ActionGroupProps) {
  return (
    <Space size={4} className={className} style={style}>
      {btns
        .filter(Boolean)
        .map((b) => b as ActionBtn)
        .filter((b) => !b.hidden && !(b.props as any)?.hidden)
        .map((b, i) => (
          <Button key={i} size="small" {...b.props} />
        ))}
    </Space>
  );
}
