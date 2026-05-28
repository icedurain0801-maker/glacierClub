import React, { useEffect, useMemo, useState } from 'react';
import { Button, Select, Space, message } from 'antd';

import { PRIZEENUM } from '@ts/club';
import { Attachment, maxEmailGoodsNum } from '@ts/email';
import { DressUpListItem, DressUpTypeOptions, DRESS_ENUM } from '@ts/appearance';

export interface AppearanceOption {
    label: string;
    value: string;
    items: {
        label: string;
        value: string;
    }[];
}

interface AppearanceInfoCompProps {
    dressUpData: Array<DressUpListItem & { dressUpName?: string }>;
    maxGoodsLength?: number;
    maxGoodsNameLength?: number;
    value?: Attachment[];
    onChange?: (value: Attachment[]) => void;
    defaultDressType: DRESS_ENUM;
    lang?: string;
    dressTypeOptions?: typeof DressUpTypeOptions;
    hideDressTypeSelect?: boolean;
    resolveImageUrl?: (url?: string) => string;
}

const AppearanceInfoComp: React.FC<AppearanceInfoCompProps> = ({
    maxGoodsLength,
    defaultDressType,
    dressUpData = [],
    value = [],
    onChange,
    lang,
    dressTypeOptions = DressUpTypeOptions,
    hideDressTypeSelect = false,
    resolveImageUrl,
}) => {
    const [ dressType, setDressType ] = useState<DRESS_ENUM>(defaultDressType);
    const [ dressUpList, setDressUpList ] = useState<Array<DressUpListItem & { dressUpName?: string }>>([]);
    const [ selectedDressId, setSelectedDressId ] = useState<number | undefined>();

    useEffect(() => {
        setDressType(defaultDressType);
    }, [ defaultDressType ]);

    useEffect(() => {
        setDressUpList(dressUpData.filter(item => item.dressType === dressType));
    }, [ dressType, dressUpData ]);

    const dressUpOptions = useMemo(() => {
        const selectedIds = value.map(item => item.goodsId);
        const normalizedLang = String(lang || '')
            .trim()
            .toLowerCase();

        const findName = (infos: Array<{ dressName: string; language: string }>, language: string) => {
            const normalized = String(language || '')
                .trim()
                .toLowerCase();

            return infos.find(item => String(item.language).trim().toLowerCase() === normalized)?.dressName;
        };

        const getNameByLang = (infos: Array<{ dressName: string; language: string }>) => {
            const candidates = [ normalizedLang ];
            if (normalizedLang && normalizedLang.startsWith('zh-') && normalizedLang !== 'zh-cn') {
                candidates.push('zh-cn');
            }
            candidates.push('en-us', 'zh-cn');

            for (const code of candidates) {
                const name = findName(infos, code);
                if (name) {
                    return name;
                }
            }

            return '名称错误';
        };

        return dressUpList.map(item => {
            const nameBase = getNameByLang(item.dressUpInfos || []);
            const expiredText = item.expiredDay ? `${item.expiredDay}天` : '永久';
            const fullName = `${nameBase}-${expiredText}（${item.id}）`;

            return {
                label: fullName,
                name: fullName,
                value: item.id,
                key: item.id,
                iconUrl: item.iconUrl,
                disabled: selectedIds.includes(item.id),
            };
        });
    }, [ dressUpList, lang, value ]);

    const isDisabledAdd = useMemo(() => {
        const maxGoodsNum = maxGoodsLength ?? maxEmailGoodsNum.default;
        return value.length >= maxGoodsNum;
    }, [ maxGoodsLength, value ]);

    const handleAdd = () => {
        if (!selectedDressId) {
            return;
        }

        const selectedDressItem = dressUpOptions.find(item => item.value === selectedDressId);
        if (!selectedDressItem) {
            return;
        }

        if (value.some(item => item.goodsId === selectedDressId)) {
            message.error(`个性装扮 ${selectedDressItem.label} 已存在`);
            return;
        }

        onChange?.([
            ...value,
            {
                goodsId: selectedDressId,
                goodsName: selectedDressItem.name || '',
                goodsNum: 1,
                goodsPic: resolveImageUrl?.(selectedDressItem.iconUrl) || selectedDressItem.iconUrl || '',
                goodsType: PRIZEENUM.Dressup,
                childType: dressType,
            },
        ]);
        setSelectedDressId(undefined);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Space>
                {!hideDressTypeSelect && (
                    <Select
                        placeholder="装扮类型"
                        style={{ width: 120 }}
                        value={dressType}
                        onChange={value => {
                            setDressType(value);
                            setSelectedDressId(undefined);
                        }}
                        options={dressTypeOptions}
                    />
                )}
                <Select
                    placeholder="装扮项"
                    style={{ width: 250 }}
                    value={selectedDressId}
                    disabled={!hideDressTypeSelect && dressType === undefined}
                    onChange={(value: number) => setSelectedDressId(value)}
                    options={dressUpOptions}
                />
                <Button type="primary" onClick={handleAdd} disabled={isDisabledAdd || !selectedDressId}>
                    添加
                </Button>
                <Button type="primary" danger onClick={() => onChange?.([])} disabled={!value.length}>
                    清空
                </Button>
            </Space>
        </div>
    );
};

export default AppearanceInfoComp;
