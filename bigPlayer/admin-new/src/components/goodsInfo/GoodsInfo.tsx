import { ReactNode, useMemo, useState } from 'react';
import { Button, InputNumber, Select, Space, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

export interface GoodsOptionsType {
  id?: string | number;
  name?: string;
  label?: string;
  value?: string | number;
  iconUrl?: string;
  icon?: string;
  Icon?: string;
  max?: number;
  [key: string]: any;
}

export interface ImageOptions {
  url: string;
  name?: string;
  value?: string | number;
  goodsId?: string | number;
}

interface GoodsInfoCmpProps {
  data?: GoodsOptionsType;
  children?: ReactNode;
  value?: any[];
  onChange?: (value: any[]) => void;
  goodsOptions?: GoodsOptionsType[];
  goodsOptionsLoading?: boolean;
  imageOptions?: ImageOptions[];
  maxGoodsLength?: number;
  singleGoodsMax?: number;
  precision?: number;
  tagHide?: boolean;
  custormValueRender?: (value: any[]) => ReactNode;
  unGetPopupContainer?: boolean;
}

const getOptionValue = (option: GoodsOptionsType) => option.value ?? option.id;
const getOptionLabel = (option: GoodsOptionsType) => option.label ?? option.name ?? String(getOptionValue(option) ?? '');
const getOptionIcon = (option?: GoodsOptionsType, imageOptions?: ImageOptions[]) => {
  if (!option) {
    return undefined;
  }
  const value = getOptionValue(option);
  return (
    option.iconUrl ||
    option.icon ||
    option.Icon ||
    imageOptions?.find(item => item.value === value || item.goodsId === value || item.name === option.name)?.url
  );
};

export default function GoodsInfoCmp({
  data,
  children,
  value,
  onChange,
  goodsOptions = [],
  goodsOptionsLoading,
  imageOptions,
  maxGoodsLength = 5,
  singleGoodsMax = 99999,
  precision = 0,
  tagHide,
  custormValueRender,
  unGetPopupContainer,
}: GoodsInfoCmpProps) {
  const currentValue = useMemo(() => (Array.isArray(value) ? value : []), [value]);
  const normalizedOptions = useMemo(
    () =>
      goodsOptions.map(option => ({
        ...option,
        value: getOptionValue(option),
        label: getOptionLabel(option),
      })),
    [goodsOptions]
  );
  const [selectedGoodsId, setSelectedGoodsId] = useState<string | number | undefined>(
    normalizedOptions[0]?.value
  );
  const [goodsNum, setGoodsNum] = useState<number | null>(1);

  if (!onChange && !goodsOptions.length && data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {getOptionIcon(data, imageOptions) && (
          <img src={getOptionIcon(data, imageOptions)} alt="" style={{ width: 32, height: 32 }} />
        )}
        <span>{getOptionLabel(data)}</span>
        {children}
      </div>
    );
  }

  const selectedOption = normalizedOptions.find(option => option.value === selectedGoodsId) || normalizedOptions[0];
  const canAdd = !!selectedOption && currentValue.length < maxGoodsLength;

  const emitAdd = () => {
    if (!selectedOption || !canAdd) {
      return;
    }
    const icon = getOptionIcon(selectedOption, imageOptions);
    const nextItem = {
      id: String(selectedOption.value),
      goodsId: selectedOption.value,
      goodsName: selectedOption.label,
      goodsNum: goodsNum || 1,
      goodsPic: icon,
      iconUrl: icon,
    };
    onChange?.([...currentValue, nextItem]);
  };

  const emitRemove = (goodsId: string | number) => {
    onChange?.(currentValue.filter(item => item.goodsId !== goodsId && item.id !== goodsId));
  };

  return (
    <div>
      <Space.Compact>
        <Select
          style={{ width: 220 }}
          loading={goodsOptionsLoading}
          options={normalizedOptions}
          value={selectedOption?.value}
          onChange={setSelectedGoodsId}
          placeholder="选择道具"
          getPopupContainer={unGetPopupContainer ? undefined : trigger => trigger.parentElement || document.body}
        />
        <InputNumber
          min={1}
          max={selectedOption?.max || singleGoodsMax}
          precision={precision}
          value={goodsNum}
          onChange={nextValue => setGoodsNum(typeof nextValue === 'number' ? nextValue : Number(nextValue) || null)}
          style={{ width: 110 }}
        />
        <Button icon={<PlusOutlined />} disabled={!canAdd} onClick={emitAdd}>
          添加
        </Button>
      </Space.Compact>
      {custormValueRender ? (
        custormValueRender(currentValue)
      ) : !tagHide ? (
        <div style={{ marginTop: 8 }}>
          {currentValue.map(item => (
            <Tag key={item.id || item.goodsId} closable onClose={() => emitRemove(item.goodsId || item.id)}>
              {item.goodsName} x {item.goodsNum}
            </Tag>
          ))}
        </div>
      ) : null}
    </div>
  );
}
