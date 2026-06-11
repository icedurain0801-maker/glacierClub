import { Card } from 'antd';
import { DressUpListItem } from '@ts/appearance';

interface AppearanceInfoCompProps {
  data?: DressUpListItem;
}

export default function AppearanceInfoComp({ data }: AppearanceInfoCompProps) {
  if (!data) return null;
  return (
    <Card size="small">
      <div>名称：{data.name}</div>
      <div>类型：{data.type}</div>
      {data.iconUrl && <img src={data.iconUrl} alt={data.name} style={{ maxHeight: 60 }} />}
    </Card>
  );
}
