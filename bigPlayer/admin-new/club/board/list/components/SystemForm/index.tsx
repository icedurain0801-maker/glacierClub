import { Button, Form, Input, InputNumber, message, Modal, Radio, Select, Switch, Table } from 'antd';
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { inject, observer } from 'mobx-react';
import type { FormInstance } from 'antd/es/form';
import { cloneDeep, get } from 'lodash';
import { EditTwoTone, PlusCircleOutlined } from '@ant-design/icons';
import type { ButtonType } from 'antd/es/button';
import Space from 'antd/es/space';

import { StoreType } from '@/store/config';
import ActionGroup from '@/components/ActionGroup';
import { getAllDressUp } from '@/api/club';

import { BoardEditParams, CLUB_ENVIRONMENT_ENUM } from '@ts/club';
import { DRESS_ENUM, DressUpListItem, DressUpTypeOptions } from '@ts/appearance';

import {
    ActionsKeys,
    CycleOptions,
    MEMBER_REWARD_LABEL_ENUM,
    MemberShipLabel,
    MemberShipTitleOptions,
    REWARD_FORM_TYPE_ENUM,
    RewardFormData,
    RewardLabel,
    RewardTypeOptions,
    RULE_ACTION,
    RewardTypeOptionsWithDressup,
} from '../../defaultVal';
import { LanguageTabWrapper } from '../Create/LanguageTabWrapper';
import { useBoardCreate } from '../../../context/boardCreateProvider';
import './index.less';
/** 论坛币、经验值、周期 下限 */
const INPUT_NUM_MIN = 0;
/** 论坛币、经验值、周期 上限 */
const INPUT_NUM_MAX = 999999;

interface RuleTableProps {
    type: 'forumCoinAddRules' | 'forumCoinExpendRules' | 'experienceRules';
}

const RuleConst = {
    actions: [ '发帖', '回复', '点赞', '置顶', '加精', '获赞', '浏览', '被收藏', '分享（兑换码中心）' ],
    cycleText: '单日', // 目前只有一种情况，以后可能会改
    forumCoinAddRules: {
        title: '论坛币',
        subtitle: '新增',
        columnTitle: '论坛币',
    },
    forumCoinExpendRules: {
        title: '',
        subtitle: '消耗',
        columnTitle: '扣除论坛币',
    },
    experienceRules: {
        title: '经验值',
        subtitle: <></>,
        columnTitle: '经验值',
    },
};

// 规则
const RuleTable = function RuleTable(props: RuleTableProps) {
    const { type } = props;
    return (
        <div className="system-form-table">
            {RuleConst[type]['title'] && <Form.Item label={`${RuleConst[type]['title']}规则`} required></Form.Item>}
            <Form.Item label={RuleConst[type]['subtitle']} colon={false}>
                <Form.List name={type}>
                    {fields => {
                        return (
                            <>
                                <Table
                                    dataSource={fields}
                                    bordered
                                    size="small"
                                    pagination={false}
                                    columns={[
                                        {
                                            title: '行为',
                                            width: 60,
                                            key: 'type',
                                            render: (field, record) => {
                                                return (
                                                    <Form.Item
                                                        noStyle
                                                        key={field.key}
                                                        shouldUpdate={(prev, next) => {
                                                            return (
                                                                get(prev, [ type, field.name, 'type' ]) !==
                                                                get(next, [ type, field.name, 'type' ])
                                                            );
                                                        }}
                                                    >
                                                        {({ getFieldValue }) => {
                                                            const val = getFieldValue([ type, field.name, 'type' ]);
                                                            return ActionsKeys[val as RULE_ACTION];
                                                        }}
                                                    </Form.Item>
                                                );
                                            },
                                        },
                                        {
                                            title: RuleConst[type]['columnTitle'],
                                            width: 100,
                                            key: 'value',
                                            render: field => {
                                                return (
                                                    <Form.Item
                                                        name={[ field.name, 'value' ]}
                                                        fieldKey={[ field.fieldKey, 'value' ]}
                                                        rules={[ { required: true, message: '请输入' } ]}
                                                    >
                                                        <InputNumber
                                                            min={INPUT_NUM_MIN}
                                                            max={INPUT_NUM_MAX}
                                                            placeholder="请输入"
                                                            step={1}
                                                            precision={0}
                                                        />
                                                    </Form.Item>
                                                );
                                            },
                                        },
                                        {
                                            title: '周期',
                                            width: 80,
                                            key: 'cycle',
                                            render: field => {
                                                return (
                                                    <Form.Item
                                                        name={[ field.name, 'cycle' ]}
                                                        fieldKey={[ field.fieldKey, 'cycle' ]}
                                                        rules={[ { required: true, message: '请选择' } ]}
                                                    >
                                                        <Select style={{ width: 120 }} allowClear>
                                                            {CycleOptions.map(({ label, value }) => {
                                                                return (
                                                                    <Select.Option
                                                                        value={value}
                                                                        label={label}
                                                                        key={value}
                                                                    >
                                                                        {label}
                                                                    </Select.Option>
                                                                );
                                                            })}
                                                        </Select>
                                                    </Form.Item>
                                                );
                                            },
                                        },
                                        {
                                            title: '上限',
                                            width: 100,
                                            key: 'upperLimit',
                                            render: field => {
                                                return (
                                                    <Form.Item
                                                        name={[ field.name, 'upperLimit' ]}
                                                        fieldKey={[ field.fieldKey, 'upperLimit' ]}
                                                        rules={[ { required: true, message: '请输入' } ]}
                                                    >
                                                        <InputNumber
                                                            min={INPUT_NUM_MIN}
                                                            max={INPUT_NUM_MAX}
                                                            placeholder="请输入"
                                                            step={1}
                                                            precision={0}
                                                        />
                                                    </Form.Item>
                                                );
                                            },
                                        },
                                    ]}
                                />
                            </>
                        );
                    }}
                </Form.List>
            </Form.Item>
        </div>
    );
};

// 达成奖励弹窗
const RewardForm = forwardRef(
    (props: { data: RewardFormData[]; clubDeployVersion: CLUB_ENVIRONMENT_ENUM; boardId?: number }, ref) => {
        const { data, clubDeployVersion, boardId } = props;
        const [ form ] = Form.useForm();
        const [ reward, setReward ] = useState<RewardFormData[]>([]);
        const [ dressUpData, setDressUpData ] = useState<Array<DressUpListItem & { dressName: string }>>([]);

        useEffect(() => {
            if (data != null) {
                setReward(data);
            }
        }, [ data, form ]);
        async function handleAdd() {
            const values = await form.validateFields();
            if (reward.some(v => v.type === values.type)) {
                return form.setFields([
                    {
                        name: [ 'num' ],
                        errors: [ '同类型的奖励只可添加一个' ],
                    },
                    {
                        name: [ 'id' ],
                        errors: [ '同类型的奖励只可添加一个' ],
                    },
                ]);
            }
            const newValues = values.type === REWARD_FORM_TYPE_ENUM.Dressup ? { ...values, num: 1 } : values;
            setReward(v => [ ...v, newValues ]);
        }
        useImperativeHandle(ref, () => ({ reward }));

        const fetchTableData = useCallback(async () => {
            try {
                const { data } = await getAllDressUp(boardId!, clubDeployVersion);
                if (data == null) {
                    setDressUpData([]);
                } else {
                    const fillNameData = data.map(item => {
                        const englishInfo = item.dressUpInfos.find(i => i.language === 'en-US')!;
                        const chineseInfo = item.dressUpInfos.find(i => i.language === 'zh-CN')!;

                        return {
                            ...item,
                            dressName: `${englishInfo?.dressName || chineseInfo?.dressName || '名称错误'}-${
                                item.expiredDay ? item.expiredDay + '天' : '永久'
                            }（${item.id}）`,
                        };
                    });
                    setDressUpData(fillNameData);
                }
            } catch (e) {
                console.error(e);
            }
        }, [ boardId, clubDeployVersion ]);

        useEffect(() => {
            boardId && fetchTableData();
        }, [ boardId, fetchTableData ]);

        return (
            <Form form={form} initialValues={{ type: REWARD_FORM_TYPE_ENUM.Point, childType: DRESS_ENUM.Avatar }}>
                <Space align="baseline">
                    <Form.Item name="type" noStyle>
                        <Select
                            options={boardId ? RewardTypeOptionsWithDressup : RewardTypeOptions}
                            style={{ width: 100 }}
                        />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(prev, cur) => prev.type !== cur.type}>
                        {({ getFieldValue }) => {
                            const type = getFieldValue('type');
                            if (type === REWARD_FORM_TYPE_ENUM.Dressup) {
                                // 如果选中了 Dressup，渲染装扮
                                return (
                                    <Space>
                                        <Form.Item
                                            name="childType"
                                            // className="exp-form-item"
                                            rules={[ { required: true, message: '请选择个性装扮' } ]}
                                        >
                                            <Select
                                                placeholder="装扮类型"
                                                style={{ width: 120 }}
                                                options={DressUpTypeOptions}
                                                onChange={val => {
                                                    form.setFieldsValue({ id: undefined });
                                                }}
                                            />
                                        </Form.Item>
                                        <Form.Item
                                            noStyle
                                            shouldUpdate={(prev, cur) => prev.childType !== cur.childType}
                                        >
                                            {({ getFieldValue }) => {
                                                const childType = getFieldValue('childType');
                                                const filteredOptions = dressUpData
                                                    .filter(item => item.dressType === childType)
                                                    .map(item => ({
                                                        label: item.dressName,
                                                        value: item.id,
                                                    }));

                                                return (
                                                    <Form.Item
                                                        name="id"
                                                        // className="exp-form-item"
                                                        rules={[ { required: true, message: '请选择装扮内容' } ]}
                                                    >
                                                        <Select
                                                            placeholder="选择装扮内容"
                                                            style={{ width: 180 }}
                                                            options={filteredOptions}
                                                        />
                                                    </Form.Item>
                                                );
                                            }}
                                        </Form.Item>
                                    </Space>
                                );
                            }

                            // 默认情况：渲染数量输入框
                            return (
                                <Form.Item name="num" rules={[ { required: true, message: '不能为空' } ]}>
                                    <InputNumber
                                        min={1}
                                        max={INPUT_NUM_MAX}
                                        placeholder="请输入"
                                        step={1}
                                        style={{ width: 120 }}
                                        precision={0}
                                    />
                                </Form.Item>
                            );
                        }}
                    </Form.Item>

                    <Button type="primary" onClick={handleAdd} className="add-btn">
                        + 添加
                    </Button>
                </Space>
                <div className="flex wrap">
                    {reward.map((v, i) => (
                        <div key={i} className="reward-item">
                            {/* 个性状态定制显示 */}
                            {RewardLabel[v.type]}：
                            {v.type === REWARD_FORM_TYPE_ENUM.Dressup
                                ? `${dressUpData?.find(item => item.id === v.id)?.dressName}`
                                : ''}
                            {v.num}
                            <span className="close-font" onClick={() => setReward(k => k.filter((j, ii) => ii !== i))}>
                                x
                            </span>
                        </div>
                    ))}
                </div>
                <div className="help-tip">注：同个类型的奖励最多仅可添加1次</div>
            </Form>
        );
    }
);
const GrowthTable = function GrowthTable({ modalForm }: { modalForm: FormInstance }) {
    const [ editingArr, setEditingArr ] = useState<number[]>([]);
    const {
        growthSystemLanguages,
        setGrowthSystemLanguages,
        growthActiveKey,
        setGrowthActiveKey,
        isEN,
        clubDeployVersion,
        boardId,
    } = useBoardCreate();

    const handleSwitchChange = (checked: boolean, setFieldsValue: FormInstance['setFieldsValue']) => {
        Modal.confirm({
            content: checked
                ? '确认要开启成长体系吗？若确认开启请谨慎设置经验值，切忌反复修改'
                : '确认要关闭成长体系吗？关闭后玩家经验值达到新等级后，若设置了奖励则不会获得奖励，请谨慎操作',
            onOk: () => {
                setFieldsValue({ growthSystemEnable: checked ? 1 : 0 });
            },
        });
    };
    const handleAppendReward = useCallback(
        ({
            index,
            goods,
            setFieldsValue,
            getFieldValue,
        }: {
            getFieldValue: FormInstance['getFieldValue'];
            index: number;
            goods: RewardFormData[];
            setFieldsValue: FormInstance['setFieldsValue'];
        }) => {
            const ref = React.createRef<{ reward: RewardFormData[] }>();
            Modal.confirm({
                className: 'club-reward-form-modal',
                icon: null,
                title: '达成奖励',
                closable: true,
                content: <RewardForm ref={ref} data={goods} clubDeployVersion={clubDeployVersion} boardId={boardId} />,
                width: 650,
                onOk() {
                    const currentValues = getFieldValue('growthSystems');
                    currentValues[index].goods = ref.current?.reward;
                    setFieldsValue({
                        growthSystems: currentValues,
                    });
                },
            });
        },
        [ boardId, clubDeployVersion ]
    );
    return (
        <div className="growth-form-table">
            <Form.Item required label="成长体系">
                <></>
            </Form.Item>
            <Form.Item name="growthSystemEnable" noStyle>
                <></>
            </Form.Item>

            <Form.Item shouldUpdate={(pre, curr) => pre.growthSystemEnable !== curr.growthSystemEnable} noStyle>
                {({ getFieldValue, setFieldsValue }) => {
                    return (
                        <>
                            <Form.Item label={<></>} colon={false}>
                                <Switch
                                    checked={getFieldValue('growthSystemEnable')}
                                    checkedChildren="ON"
                                    unCheckedChildren="OFF"
                                    onChange={checked => handleSwitchChange(checked, setFieldsValue)}
                                />
                            </Form.Item>
                            <Form.Item hidden={!getFieldValue('growthSystemEnable')} label={<></>} colon={false}>
                                <LanguageTabWrapper
                                    modalForm={modalForm}
                                    selectedLanguages={growthSystemLanguages}
                                    setSelectedLanguages={setGrowthSystemLanguages}
                                    activeKey={growthActiveKey}
                                    setActiveKey={setGrowthActiveKey}
                                    afterAddLanguage={newLang => {
                                        const growthSystems: any[] = modalForm.getFieldValue('growthSystems');
                                        const newArr = growthSystems.map(item => {
                                            return {
                                                ...item,
                                                multiLang: {
                                                    ...item['multiLang'],
                                                    [newLang]: {
                                                        message: '',
                                                    },
                                                },
                                            };
                                        });
                                        modalForm.setFields([
                                            {
                                                name: 'growthSystems',
                                                value: newArr,
                                            },
                                        ]);
                                    }}
                                >
                                    {lang => (
                                        <Form.List name="growthSystems">
                                            {(fields, { add, remove }) => {
                                                return (
                                                    <Table
                                                        dataSource={fields}
                                                        bordered
                                                        size="small"
                                                        pagination={false}
                                                        columns={[
                                                            {
                                                                key: 'level',
                                                                title: '等级',
                                                                width: 40,
                                                                render(v, r, i) {
                                                                    return i + 1;
                                                                },
                                                            },
                                                            {
                                                                title: '升级所需经验值',
                                                                width: 160,
                                                                key: 'exp',
                                                                render: (field, r, i) => {
                                                                    return (
                                                                        <>
                                                                            <Form.Item
                                                                                name={[ field.name, 'expCopy' ]}
                                                                                fieldKey={[ field.fieldKey, 'expCopy' ]}
                                                                                rules={[
                                                                                    {
                                                                                        required: true,
                                                                                        validator(
                                                                                            rule: any,
                                                                                            value: any
                                                                                        ) {
                                                                                            let result = Promise.resolve();
                                                                                            if (value == null) {
                                                                                                result = Promise.reject(
                                                                                                    '经验值不可为空！'
                                                                                                );
                                                                                            } else if (
                                                                                                value <=
                                                                                                getFieldValue([
                                                                                                    'growthSystems',
                                                                                                    i - 1,
                                                                                                    'exp',
                                                                                                ])
                                                                                            ) {
                                                                                                result = Promise.reject(
                                                                                                    '高等级经验值需大于低等级'
                                                                                                );
                                                                                            }
                                                                                            return result;
                                                                                        },
                                                                                    },
                                                                                ]}
                                                                                hidden={!editingArr.includes(i)}
                                                                            >
                                                                                <InputNumber
                                                                                    min={
                                                                                        i
                                                                                            ? getFieldValue([
                                                                                                  'growthSystems',
                                                                                                  i - 1,
                                                                                                  'exp',
                                                                                              ]) + 1
                                                                                            : INPUT_NUM_MIN
                                                                                    }
                                                                                    max={
                                                                                        i + 1 ===
                                                                                        getFieldValue('growthSystems')
                                                                                            .length
                                                                                            ? INPUT_NUM_MAX
                                                                                            : getFieldValue([
                                                                                                  'growthSystems',
                                                                                                  i + 1,
                                                                                                  'exp',
                                                                                              ]) - 1
                                                                                    }
                                                                                    placeholder="请输入经验值"
                                                                                    disabled={getFieldValue([
                                                                                        'growthSystems',
                                                                                        field.name,
                                                                                        'id',
                                                                                    ])}
                                                                                    step={1}
                                                                                    precision={0}
                                                                                />
                                                                            </Form.Item>
                                                                            <Form.Item
                                                                                name={[ field.name, 'exp' ]}
                                                                                fieldKey={[ field.fieldKey, 'exp' ]}
                                                                                noStyle
                                                                            >
                                                                                <>
                                                                                    {editingArr.includes(i)
                                                                                        ? ''
                                                                                        : getFieldValue([
                                                                                              'growthSystems',
                                                                                              field.name,
                                                                                              'exp',
                                                                                          ]) ?? 0}
                                                                                </>
                                                                            </Form.Item>
                                                                        </>
                                                                    );
                                                                },
                                                            },
                                                            {
                                                                title: '称号',
                                                                width: 80,
                                                                key: 'title',
                                                                render: (field, r, i) => {
                                                                    return (
                                                                        <>
                                                                            <Form.Item
                                                                                name={[ field.name, 'titleCopy' ]}
                                                                                fieldKey={[ field.fieldKey, 'titleCopy' ]}
                                                                                hidden={!editingArr.includes(i)}
                                                                            >
                                                                                <Select style={{ width: 80 }}>
                                                                                    {MemberShipTitleOptions.map(
                                                                                        ({ label, value }) => {
                                                                                            return (
                                                                                                <Select.Option
                                                                                                    value={value}
                                                                                                    label={label}
                                                                                                    key={value}
                                                                                                >
                                                                                                    {label}
                                                                                                </Select.Option>
                                                                                            );
                                                                                        }
                                                                                    )}
                                                                                </Select>
                                                                            </Form.Item>
                                                                            <Form.Item
                                                                                name={[ field.name, 'title' ]}
                                                                                fieldKey={[ field.fieldKey, 'title' ]}
                                                                                noStyle
                                                                            >
                                                                                <>
                                                                                    {editingArr.includes(i)
                                                                                        ? ''
                                                                                        : MemberShipLabel[
                                                                                              getFieldValue([
                                                                                                  'growthSystems',
                                                                                                  field.name,
                                                                                                  'title',
                                                                                              ]) as MEMBER_REWARD_LABEL_ENUM
                                                                                          ] ?? '无'}
                                                                                </>
                                                                            </Form.Item>
                                                                        </>
                                                                    );
                                                                },
                                                            },
                                                            {
                                                                key: 'goods',
                                                                title: '达成奖励',
                                                                width: 120,
                                                                render(v, r, i) {
                                                                    const goods = getFieldValue([
                                                                        'growthSystems',
                                                                        v.name,
                                                                        'goods',
                                                                    ]) as RewardFormData[];
                                                                    return (
                                                                        <Form.Item
                                                                            name={[ v.name, 'reward' ]}
                                                                            fieldKey={[ v.fieldKey, 'reward' ]}
                                                                            noStyle
                                                                        >
                                                                            <div
                                                                                style={{
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                }}
                                                                            >
                                                                                <div>
                                                                                    {goods.length
                                                                                        ? goods.map((k, ii) => (
                                                                                              <div key={ii}>
                                                                                                  {RewardLabel[k.type]}:
                                                                                                  {k.type ===
                                                                                                      REWARD_FORM_TYPE_ENUM.Dressup &&
                                                                                                      `(id:${k.id})`}
                                                                                                  {k.num}
                                                                                              </div>
                                                                                          ))
                                                                                        : editingArr.includes(i)
                                                                                        ? ''
                                                                                        : '无'}
                                                                                </div>
                                                                                <div>
                                                                                    {editingArr.includes(i) ? (
                                                                                        goods.length ? (
                                                                                            <EditTwoTone
                                                                                                style={{
                                                                                                    marginLeft: 10,
                                                                                                }}
                                                                                                onClick={() =>
                                                                                                    handleAppendReward({
                                                                                                        goods,
                                                                                                        setFieldsValue,
                                                                                                        getFieldValue,
                                                                                                        index: i,
                                                                                                    })
                                                                                                }
                                                                                            />
                                                                                        ) : (
                                                                                            <span
                                                                                                style={{
                                                                                                    color: '#169BD5',
                                                                                                    cursor: 'pointer',
                                                                                                }}
                                                                                                onClick={() =>
                                                                                                    handleAppendReward({
                                                                                                        goods,
                                                                                                        setFieldsValue,
                                                                                                        getFieldValue,
                                                                                                        index: i,
                                                                                                    })
                                                                                                }
                                                                                            >
                                                                                                +添加
                                                                                            </span>
                                                                                        )
                                                                                    ) : (
                                                                                        ''
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </Form.Item>
                                                                    );
                                                                },
                                                            },
                                                            {
                                                                key: 'message',
                                                                title: '消息通知提示语',
                                                                width: 200,
                                                                render: (field, r, i) => {
                                                                    return (
                                                                        <>
                                                                            <Form.Item
                                                                                name={
                                                                                    isEN
                                                                                        ? [
                                                                                              field.name,
                                                                                              'multiLang',
                                                                                              lang,
                                                                                              'messageCopy',
                                                                                          ]
                                                                                        : [ field.name, 'messageCopy' ]
                                                                                }
                                                                                fieldKey={
                                                                                    isEN
                                                                                        ? [
                                                                                              field.fieldKey,
                                                                                              'multiLang',
                                                                                              lang,
                                                                                              'messageCopy',
                                                                                          ]
                                                                                        : [
                                                                                              field.fieldKey,
                                                                                              'messageCopy',
                                                                                          ]
                                                                                }
                                                                                hidden={!editingArr.includes(i)}
                                                                            >
                                                                                <Input.TextArea
                                                                                    maxLength={200}
                                                                                    placeholder="请输入"
                                                                                />
                                                                            </Form.Item>
                                                                            <Form.Item
                                                                                name={
                                                                                    isEN
                                                                                        ? [
                                                                                              field.name,
                                                                                              'multiLang',
                                                                                              lang,
                                                                                              'message',
                                                                                          ]
                                                                                        : [ field.name, 'message' ]
                                                                                }
                                                                                fieldKey={
                                                                                    isEN
                                                                                        ? [
                                                                                              field.fieldKey,
                                                                                              'multiLang',
                                                                                              lang,
                                                                                              'message',
                                                                                          ]
                                                                                        : [ field.fieldKey, 'message' ]
                                                                                }
                                                                                noStyle
                                                                            >
                                                                                <>
                                                                                    {editingArr.includes(i)
                                                                                        ? ''
                                                                                        : getFieldValue(
                                                                                              isEN
                                                                                                  ? [
                                                                                                        'growthSystems',
                                                                                                        field.name,
                                                                                                        'multiLang',
                                                                                                        lang,
                                                                                                        'message',
                                                                                                    ]
                                                                                                  : [
                                                                                                        'growthSystems',
                                                                                                        field.name,
                                                                                                        'message',
                                                                                                    ]
                                                                                          ) || '无'}
                                                                                </>
                                                                            </Form.Item>
                                                                        </>
                                                                    );
                                                                },
                                                            },
                                                            {
                                                                key: 'action',
                                                                title: '操作',
                                                                width: 120,
                                                                align: 'center',
                                                                render: (_, row, i) => (
                                                                    <ActionGroup
                                                                        commonButtonProps={{
                                                                            type: 'link',
                                                                            size: 'small',
                                                                        }}
                                                                        btns={
                                                                            i
                                                                                ? [
                                                                                      {
                                                                                          title: '',
                                                                                          icon: '',
                                                                                          props: {
                                                                                              type: 'link' as ButtonType,
                                                                                              children: editingArr.includes(
                                                                                                  i
                                                                                              )
                                                                                                  ? '保存'
                                                                                                  : '编辑',
                                                                                              disabled:
                                                                                                  !!editingArr.length &&
                                                                                                  !editingArr.includes(
                                                                                                      i
                                                                                                  ),
                                                                                              onClick() {
                                                                                                  if (
                                                                                                      editingArr.includes(
                                                                                                          i
                                                                                                      )
                                                                                                  ) {
                                                                                                      const currentValues = getFieldValue(
                                                                                                          'growthSystems'
                                                                                                      );
                                                                                                      currentValues[
                                                                                                          i
                                                                                                      ].exp =
                                                                                                          currentValues[
                                                                                                              i
                                                                                                          ].expCopy;
                                                                                                      // 海外
                                                                                                      if (isEN) {
                                                                                                          (
                                                                                                              (currentValues[
                                                                                                                  i
                                                                                                              ]
                                                                                                                  .multiLang ??
                                                                                                                  {})[
                                                                                                                  lang
                                                                                                              ] ?? {}
                                                                                                          ).message =
                                                                                                              currentValues[
                                                                                                                  i
                                                                                                              ].multiLang[
                                                                                                                  lang
                                                                                                              ]?.messageCopy;
                                                                                                      } else {
                                                                                                          currentValues[
                                                                                                              i
                                                                                                          ].message =
                                                                                                              currentValues[
                                                                                                                  i
                                                                                                              ].messageCopy;
                                                                                                      }

                                                                                                      currentValues[
                                                                                                          i
                                                                                                      ].title =
                                                                                                          currentValues[
                                                                                                              i
                                                                                                          ].titleCopy;
                                                                                                      setFieldsValue({
                                                                                                          growthSystems: cloneDeep(
                                                                                                              currentValues
                                                                                                          ),
                                                                                                      });
                                                                                                  }
                                                                                                  setEditingArr(v =>
                                                                                                      editingArr.includes(
                                                                                                          i
                                                                                                      )
                                                                                                          ? v.filter(
                                                                                                                k =>
                                                                                                                    k !==
                                                                                                                    i
                                                                                                            )
                                                                                                          : [ ...v, i ]
                                                                                                  );
                                                                                              },
                                                                                          },
                                                                                      },
                                                                                      {
                                                                                          title: '',
                                                                                          icon: '',
                                                                                          props: {
                                                                                              type: 'link' as ButtonType,
                                                                                              children: '取消',
                                                                                              hidden: !editingArr.includes(
                                                                                                  i
                                                                                              ),
                                                                                              onClick() {
                                                                                                  setEditingArr(v =>
                                                                                                      v.filter(
                                                                                                          k => k !== i
                                                                                                      )
                                                                                                  );
                                                                                                  const currentValues = getFieldValue(
                                                                                                      'growthSystems'
                                                                                                  );
                                                                                                  currentValues[
                                                                                                      i
                                                                                                  ].expCopy =
                                                                                                      currentValues[
                                                                                                          i
                                                                                                      ].exp;

                                                                                                  // 海外
                                                                                                  if (isEN) {
                                                                                                      (
                                                                                                          (currentValues[
                                                                                                              i
                                                                                                          ].multiLang ??
                                                                                                              {})[
                                                                                                              lang
                                                                                                          ] ?? {}
                                                                                                      ).messageCopy =
                                                                                                          currentValues[
                                                                                                              i
                                                                                                          ]?.multiLang?.[
                                                                                                              lang
                                                                                                          ]?.message;
                                                                                                  } else {
                                                                                                      currentValues[
                                                                                                          i
                                                                                                      ].messageCopy =
                                                                                                          currentValues[
                                                                                                              i
                                                                                                          ].message;
                                                                                                  }

                                                                                                  currentValues[
                                                                                                      i
                                                                                                  ].titleCopy =
                                                                                                      currentValues[
                                                                                                          i
                                                                                                      ].title;
                                                                                                  setFieldsValue({
                                                                                                      growthSystems: currentValues,
                                                                                                  });
                                                                                              },
                                                                                          },
                                                                                      },
                                                                                      {
                                                                                          title: '',
                                                                                          icon: '',
                                                                                          props: {
                                                                                              type: 'link' as ButtonType,
                                                                                              children: '删除',
                                                                                              hidden:
                                                                                                  editingArr.includes(
                                                                                                      i
                                                                                                  ) ||
                                                                                                  getFieldValue(
                                                                                                      'growthSystems'
                                                                                                  )[i].id,
                                                                                              onClick() {
                                                                                                  Modal.confirm({
                                                                                                      content:
                                                                                                          '确认要删除该等级吗？',
                                                                                                      onOk() {
                                                                                                          remove(i);
                                                                                                      },
                                                                                                  });
                                                                                              },
                                                                                          },
                                                                                      },
                                                                                  ]
                                                                                : []
                                                                        }
                                                                    />
                                                                ),
                                                            },
                                                        ]}
                                                        footer={() =>
                                                            fields.length >= 20 ? (
                                                                ''
                                                            ) : (
                                                                <Button
                                                                    block
                                                                    onClick={() => {
                                                                        const lastItem = getFieldValue('growthSystems')[
                                                                            getFieldValue('growthSystems').length - 1
                                                                        ];
                                                                        if (lastItem.exp === INPUT_NUM_MAX) {
                                                                            return message.warning(
                                                                                '当前最高等级的经验值已达到上限！'
                                                                            );
                                                                        }
                                                                        const level =
                                                                            getFieldValue('growthSystems').length + 1;
                                                                        setEditingArr(v => [ ...v, level - 1 ]);
                                                                        add({
                                                                            level,
                                                                            exp: lastItem.exp + 1,
                                                                            expCopy: lastItem.exp + 1,
                                                                            title: lastItem.title,
                                                                            titleCopy: lastItem.title,
                                                                            goods: [],
                                                                            message: '',
                                                                            ...(isEN
                                                                                ? {
                                                                                      multiLang: growthSystemLanguages.reduce(
                                                                                          (acc, cur) => {
                                                                                              acc[cur] = {
                                                                                                  message: '',
                                                                                              };
                                                                                              return acc;
                                                                                          },
                                                                                          {} as Record<
                                                                                              string,
                                                                                              { message: string }
                                                                                          >
                                                                                      ),
                                                                                  }
                                                                                : {}),
                                                                            // messageCopy: '',
                                                                        });
                                                                        setTimeout(() => {
                                                                            const ele = document.querySelector(
                                                                                '.big-player-board .ant-drawer-body'
                                                                            ) as HTMLElement;
                                                                            ele.scrollTop = ele.scrollHeight;
                                                                        });
                                                                    }}
                                                                    disabled={!!editingArr.length}
                                                                    icon={<PlusCircleOutlined />}
                                                                >
                                                                    添加等级
                                                                </Button>
                                                            )
                                                        }
                                                    />
                                                );
                                            }}
                                        </Form.List>
                                    )}
                                </LanguageTabWrapper>
                            </Form.Item>
                        </>
                    );
                }}
            </Form.Item>
        </div>
    );
};
// 体系设置
interface BaseFormProps {
    data: BoardEditParams;
    modalForm: FormInstance;
    isCreate: boolean;
}

interface BaseFormMobxProps extends BaseFormProps, Pick<StoreType, 'GameContext'> {}
const BaseForm = function BaseForm(props: BaseFormProps) {
    const {
        // eslint-disable-next-line no-empty-pattern
        GameContext: {},
        modalForm,
    } = props as BaseFormMobxProps;

    return (
        <>
            <span style={{ color: 'red' }}>※修改周期或上限后，被修改的行为均会即时从0计算上限，请谨慎修改！！</span>
            <div style={{ display: 'none' }}>
                <RuleTable type="forumCoinAddRules"></RuleTable>
                <RuleTable type="forumCoinExpendRules"></RuleTable>
            </div>
            <RuleTable type="experienceRules"></RuleTable>
            <GrowthTable modalForm={modalForm} />
        </>
    );
};

export default inject('GameContext')(observer(BaseForm));
