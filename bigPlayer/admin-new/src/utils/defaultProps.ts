export interface HugeConfirmModalProps {
  title?: string;
  content?: string;
  onOk?: () => void;
  onCancel?: () => void;
}

export function withDefaultProps<T extends object>(defaults: Partial<T>) {
  return (props: T): T => ({ ...defaults, ...props });
}

export default { withDefaultProps };
