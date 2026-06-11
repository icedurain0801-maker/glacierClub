import React, { useMemo, useState } from 'react';
import { Button, Input, InputNumber, Space, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

interface RealInfoCompProps {
  value?: any[];
  onChange?: (value: any[]) => void;
  maxGoodsLength?: number;
  singleGoodsMax?: number;
  precision?: number;
  defaultGoods?: string;
  tagHide?: boolean;
}

export default function RealInfoComp({
  value = [],
  onChange,
  maxGoodsLength = 5,
  singleGoodsMax = 99999,
  precision = 0,
  defaultGoods,
  tagHide,
}: RealInfoCompProps) {
  const [goodsName, setGoodsName] = useState(defaultGoods || '实物奖励');
  const [goodsNum, setGoodsNum] = useState<number | null>(1);
  const currentValue = useMemo(() => (Array.isArray(value) ? value : []), [value]);
  const disabled = currentValue.length >= maxGoodsLength;

  const emitAdd = () => {
    const name = (defaultGoods || goodsName || '奖励').trim();
    const next = {
      id: `${Date.now()}_${currentValue.length}`,
      goodsId: Date.now(),
      goodsName: name,
      goodsNum: goodsNum || 1,
    };
    onChange?.([...currentValue, next]);
  };

  const emitRemove = (id: string | number) => {
    onChange?.(currentValue.filter(item => item.id !== id && item.goodsId !== id));
  };

  return (
    <div>
      <Space.Compact>
        <Input
          style={{ width: 180 }}
          value={defaultGoods || goodsName}
          disabled={!!defaultGoods}
          onChange={event => setGoodsName(event.target.value)}
          placeholder="奖励名称"
        />
        <InputNumber
          min={1}
          max={singleGoodsMax}
          precision={precision}
          value={goodsNum}
          onChange={nextValue => setGoodsNum(typeof nextValue === 'number' ? nextValue : Number(nextValue) || null)}
          style={{ width: 110 }}
        />
        <Button icon={<PlusOutlined />} disabled={disabled} onClick={emitAdd}>
          添加
        </Button>
      </Space.Compact>
      {!tagHide && (
        <div style={{ marginTop: 8 }}>
          {currentValue.map(item => (
            <Tag key={item.id || item.goodsId} closable onClose={() => emitRemove(item.id || item.goodsId)}>
              {item.goodsName} x {item.goodsNum}
            </Tag>
          ))}
        </div>
      )}
    </div>
  );
}
