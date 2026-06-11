import React from 'react';

export function DividerTitle(title: React.ReactNode) {
  return (
    <div
      style={{
        margin: '0 0 24px',
        paddingBottom: 12,
        borderBottom: '1px solid #f0f0f0',
        fontSize: 18,
        fontWeight: 600,
      }}
    >
      {title}
    </div>
  );
}
