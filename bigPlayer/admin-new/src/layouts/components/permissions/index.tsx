import { ReactNode } from 'react';
import { useContentPermissionFn } from '@/context';

interface PermissionsProps {
  value: string;
  children: ReactNode;
}

export default function Permissions({ value, children }: PermissionsProps) {
  const { hasFunctionPermit } = useContentPermissionFn();
  if (!hasFunctionPermit(value)) return null;
  return <>{children}</>;
}
