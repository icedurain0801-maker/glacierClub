import { Tooltip } from 'antd';

interface TableCellTextProps {
  data?: string;
  maxLength?: number;
}

export default function TableCellText({ data, maxLength = 40 }: TableCellTextProps) {
  if (!data) return <span>-</span>;
  if (data.length > maxLength) {
    return (
      <Tooltip title={data}>
        <span>{data.slice(0, maxLength)}…</span>
      </Tooltip>
    );
  }
  return <span>{data}</span>;
}
