import { createContext, ReactNode } from 'react';

export const EditLineContext = createContext<{ editing: boolean }>({ editing: false });

interface EditLineProps {
  label?: ReactNode;
  children: ReactNode;
}

export default function EditLine({ label, children }: EditLineProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
      {label && <span style={{ marginRight: 8, color: '#666' }}>{label}：</span>}
      <span>{children}</span>
    </div>
  );
}
