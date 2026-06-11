import React, { useMemo } from 'react';

export interface PieDataItem {
  name: string;
  num: number;
}

interface PieChartPropsType {
  data?: Array<PieDataItem>;
}

const colors = ['#1677ff', '#52c41a', '#faad14', '#eb2f96', '#13c2c2', '#722ed1'];

const PieChart = React.memo((props: PieChartPropsType) => {
  const data = props.data?.length ? props.data : [{ name: 'No data', num: 0 }];
  const total = data.reduce((sum, item) => sum + Number(item.num || 0), 0);

  const rows = useMemo(
    () =>
      data.map((item, index) => ({
        ...item,
        percent: total > 0 ? Math.round((Number(item.num || 0) / total) * 100) : 0,
        color: colors[index % colors.length],
      })),
    [data, total]
  );

  const gradient = useMemo(() => {
    if (!total) {
      return '#f0f2f5';
    }

    let current = 0;
    return rows
      .map(item => {
        const start = current;
        current += item.percent;
        return `${item.color} ${start}% ${current}%`;
      })
      .join(', ');
  }, [rows, total]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, minHeight: 220 }}>
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: '50%',
          background: total ? `conic-gradient(${gradient})` : gradient,
          position: 'relative',
          flex: '0 0 auto',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 42,
            borderRadius: '50%',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            boxShadow: 'inset 0 0 0 1px #f0f0f0',
          }}
        >
          <strong style={{ fontSize: 22 }}>{total}</strong>
          <span style={{ color: '#8c8c8c', fontSize: 12 }}>Total</span>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 180 }}>
        {rows.map(item => (
          <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ width: 10, height: 10, background: item.color, display: 'inline-block' }} />
            <span style={{ flex: 1 }}>{item.name}</span>
            <span style={{ color: '#8c8c8c' }}>{item.percent}%</span>
            <span>{item.num}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

export default PieChart;
