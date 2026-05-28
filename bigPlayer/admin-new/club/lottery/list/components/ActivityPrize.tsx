import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Form, Select, Space, Tag } from 'antd';
import type { FormInstance } from 'antd/es/form';

import GoodsInfoCmp, { GoodsOptionsType } from '@/components/goodsInfo/GoodsInfo';
import RealInfoComp from '@/pages/pointsMall/mall/components/realInfoComp';
import { useContentTabSearch } from '@/context';
import AppearanceInfoComp from '@/pages/club/appearance/components/AppearanceInfoComp';
import { getFixedPrizeGoodsName } from '@/pages/club/lottery/utils/fixedPrizeI18n';

import { ActivityPrizeItem, CLUB_DEPLOY_VERSION, PrizeConstant, PRIZEENUM, PrizeFieldConstant } from '@ts/club';
import { APPROVAL_STATUS, DressUpListItem, DRESS_ENUM } from '@ts/appearance';
interface ActivityPrizeProps {
    form: FormInstance<any>;
    /** 嵌套表单字段前缀，例如 ['multiLangForm', 0] */
    fieldPrefix?: Array<string | number>;
    /** 当前语言 code（多语言场景由父组件传入，例如 en-US / zh-CN / zh-TW / ko-KR / ja-jp） */
    lang?: string;
    isEdit?: boolean;
    value?: (ActivityPrizeItem & { id: string })[];
    onChange?: (v: any[]) => void;
    /** 游戏道具下拉选项（多语言场景可传入翻译后的 options） */
    propGoodsOptions?: GoodsOptionsType[];
    propGoodsOptionsLoading?: boolean;
    /** 个性装扮列表（建议由父组件统一拉取后传入，避免多实例重复请求） */
    dressUpData?: DressUpListItem[];
}

const ActivityPrize = function (props: ActivityPrizeProps) {
    const {
        form,
        isEdit,
        value = [],
        onChange,
        fieldPrefix,
        lang,
        propGoodsOptions,
        propGoodsOptionsLoading,
        dressUpData: propDressUpData,
    } = props;

    const query = useContentTabSearch();
    const boardId = Number(query.get('boardId') || 0);
    const clubDeployVersion = query.get('clubDeployVersion')! as CLUB_DEPLOY_VERSION;

    const [ selectVal, setSelectVal ] = useState(PRIZEENUM.Prop);

    const [ dressUpData, setDressUpData ] = useState<DressUpListItem[]>(propDressUpData || []);

    const getDefaultGoodsText = useCallback((type: PRIZEENUM, language?: string) => {
        if (type === PRIZEENUM.EmpiricalValue) {
            return getFixedPrizeGoodsName('empiricalValue', language);
        }
        if (type === PRIZEENUM.MemberPoint) {
            return getFixedPrizeGoodsName('memberPointValue', language);
        }
        return '';
    }, []);

    // 多语言场景下：如果全局已锁定为“实物/非实物”，且当前 selectVal 不符合可选范围，则自动切换到可选项
    useEffect(() => {
        if (!fieldPrefix?.length) {
            return;
        }
        const localHasEntityValue = value?.some(x => x.type === PrizeFieldConstant[PRIZEENUM.Entity]);
        const hasAnyValue = (value?.length ?? 0) > 0;
        if (localHasEntityValue) {
            if (selectVal !== PRIZEENUM.Entity) {
                setSelectVal(PRIZEENUM.Entity);
            }
            return;
        }
        // 已有奖品但没有实物：禁止选实物，若当前是实物则切回道具（默认）
        if (hasAnyValue && selectVal === PRIZEENUM.Entity) {
            setSelectVal(PRIZEENUM.Prop);
        }
    }, [ fieldPrefix, selectVal, value ]);

    const options = useMemo(() => {
        const localHasEntityValue = value?.some(x => x.type === PrizeFieldConstant[PRIZEENUM.Entity]);

        const hasAnyValue = (value?.length ?? 0) > 0;
        const hasEntityValue = localHasEntityValue;

        const opt = [
            {
                label: PrizeConstant[PRIZEENUM.Prop],
                value: PRIZEENUM.Prop,
                disabled: hasAnyValue ? hasEntityValue : false,
            },
            {
                label: PrizeConstant[PRIZEENUM.Entity],
                value: PRIZEENUM.Entity,
                disabled: hasAnyValue ? !hasEntityValue : false,
            },
            {
                label: PrizeConstant[PRIZEENUM.EmpiricalValue],
                value: PRIZEENUM.EmpiricalValue,
                disabled: hasAnyValue ? hasEntityValue : false,
            },
            {
                label: PrizeConstant[PRIZEENUM.MemberPoint],
                value: PRIZEENUM.MemberPoint,
                disabled: hasAnyValue ? hasEntityValue : false,
            },
            {
                label: PrizeConstant[PRIZEENUM.Dressup],
                value: PRIZEENUM.Dressup,
                disabled: hasAnyValue ? hasEntityValue : false,
            },
        ];
        return opt;
    }, [ value ]);

    const propOptions = useMemo(() => propGoodsOptions ?? [], [ propGoodsOptions ]);
    const propOptionsLoading = useMemo(() => propGoodsOptionsLoading ?? false, [ propGoodsOptionsLoading ]);

    const selectChange = useCallback(e => {
        setSelectVal(e);
    }, []);
    const addDisabled = useCallback(
        (type: string) => {
            return value?.length >= 5 ? value.filter(x => x.type === type).length : 5;
        },
        [ value ]
    );

    const handlerClose = useCallback(
        v => {
            const namePath = fieldPrefix?.length ? [ ...fieldPrefix, v.type ] : [ v.type ];
            const data: ActivityPrizeItem[] = form.getFieldValue(namePath);
            form.setFields([ { name: namePath, value: data.filter(x => x.goodsId !== v.goodsId) } ]);
            onChange && onChange(value?.filter(x => !(x.type === v.type && x.goodsId === v.goodsId)));
        },
        [ fieldPrefix, form, onChange, value ]
    );

    useEffect(() => {
        if (propDressUpData) {
            setDressUpData(propDressUpData);
            return;
        }
        // 兼容旧用法：父组件未传入时仍可从 query 获取 boardId 拉取（但建议统一在父组件拉取）
        setDressUpData([]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ propDressUpData ]);

    return (
        <div className="activity-prize-component">
            <Space align="start">
                <Select
                    style={{ width: '207px' }}
                    value={selectVal}
                    options={options}
                    onChange={selectChange}
                    disabled={isEdit}
                />
                <Form.Item
                    name={fieldPrefix?.length ? [ ...fieldPrefix, 'prop' ] : 'prop'}
                    noStyle
                    hidden={selectVal !== PRIZEENUM.Prop}
                >
                    <GoodsInfoCmp
                        goodsOptionsLoading={propOptionsLoading}
                        goodsOptions={propOptions}
                        precision={0}
                        tagHide={true}
                        singleGoodsMax={99999}
                        maxGoodsLength={addDisabled(PrizeFieldConstant[PRIZEENUM.Prop])}
                    />
                </Form.Item>
                <Form.Item
                    name={fieldPrefix?.length ? [ ...fieldPrefix, 'entity' ] : 'entity'}
                    noStyle
                    hidden={selectVal !== PRIZEENUM.Entity}
                >
                    <RealInfoComp
                        precision={0}
                        tagHide={true}
                        maxGoodsLength={addDisabled(PrizeFieldConstant[PRIZEENUM.Entity])}
                        singleGoodsMax={99999}
                    />
                </Form.Item>
                <Form.Item
                    name={fieldPrefix?.length ? [ ...fieldPrefix, 'empiricalValue' ] : 'empiricalValue'}
                    noStyle
                    hidden={selectVal !== PRIZEENUM.EmpiricalValue}
                >
                    <RealInfoComp
                        precision={0}
                        tagHide={true}
                        maxGoodsLength={addDisabled(PrizeFieldConstant[PRIZEENUM.EmpiricalValue])}
                        defaultGoods={getDefaultGoodsText(PRIZEENUM.EmpiricalValue, lang)}
                        singleGoodsMax={99999}
                    />
                </Form.Item>
                <Form.Item
                    name={fieldPrefix?.length ? [ ...fieldPrefix, 'memberPointValue' ] : 'memberPointValue'}
                    noStyle
                    hidden={selectVal !== PRIZEENUM.MemberPoint}
                >
                    <RealInfoComp
                        precision={0}
                        tagHide={true}
                        maxGoodsLength={addDisabled(PrizeFieldConstant[PRIZEENUM.MemberPoint])}
                        defaultGoods={getDefaultGoodsText(PRIZEENUM.MemberPoint, lang)}
                        singleGoodsMax={99999}
                    />
                </Form.Item>
                <Form.Item
                    name={fieldPrefix?.length ? [ ...fieldPrefix, 'appearanceValue' ] : 'appearanceValue'}
                    noStyle
                    hidden={selectVal !== PRIZEENUM.Dressup}
                >
                    <AppearanceInfoComp
                        maxGoodsLength={addDisabled(PrizeFieldConstant[PRIZEENUM.Dressup])}
                        dressUpData={dressUpData}
                        defaultDressType={DRESS_ENUM.Avatar}
                        lang={lang}
                    />
                </Form.Item>
            </Space>
            <div>
                {value?.map(v => (
                    <Tag
                        closable
                        color="#2db7f5"
                        onClose={() => handlerClose(v)}
                        key={v.id}
                        style={{ marginBottom: '8px', marginTop: '12px' }}
                    >
                        {v.goodsType === PRIZEENUM.Dressup ? '个性装扮' : ''}
                        {`${v.goodsName}；数量：${v.goodsNum}`}
                    </Tag>
                ))}
            </div>
        </div>
    );
};

export default ActivityPrize;
