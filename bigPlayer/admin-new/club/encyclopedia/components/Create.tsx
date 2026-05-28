import {
    Button,
    Drawer,
    DrawerProps,
    Form,
    FormInstance,
    Input,
    Modal,
    Radio,
    Select,
    Space,
    Tabs,
    message,
} from 'antd';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { mapValues, omit, sortBy } from 'lodash';
import { FormOutlined } from '@ant-design/icons';
import { OptionsType } from 'rc-select/lib/interface';
import { ValidateErrorEntity } from 'rc-field-form/es/interface';

import { useContentDialogContainer } from '@/context';
import { usePersistantFunction } from '@/hooks/state/useLatestValueRef';
import { addPedia, updatePedia } from '@/api/club';
import BlockHeader from '@/components/BlockHeader';

import {
    BOARD_PERMIT_SEPARATE,
    BoardPermitOptionsType,
    CLUB_DEPLOY_VERSION,
    PEDIA_SHOW_TYPE,
    PEDIA_TYPE,
    PediaListResponse,
    PediaShowTypeOptions,
    PediaTypeOptions,
    Section,
    SectionChildren,
} from '@ts/club';

import SecetionItem, { DefaultSections, DefaultSectionsChildren, SectionsChildren } from './Sections';
import { extractId } from '../../board/hooks/usePostSelect';
import { ManageCyclopedia } from './ManageCyclopedia';
import { watchStrategyGroupHandle } from './TableList';

require('./create.less');

interface CreatePediaProps extends DrawerProps {
    strategyGroupLoading: boolean;
    strategyGroupOptions: OptionsType;
    setStrategyGroupOptions: (v: OptionsType) => void;
    visible: boolean;
    data: PediaListResponse;
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    clubBoardOptions: BoardPermitOptionsType[];
    userName: string;
    languageOptions: Array<{ label: string; value: string }>;
    langMap: { [k in string]: string };
    onOk?: (data: { boardId: string }) => void;
    onCancel?: () => void;
}

// 攻略名称最大字数限制
const MAX_NAME_LENGTH = 50;

// 计算海外版块的多语言初始值（包含 multiLang 顺序、multiLangColumns、multiLangToolColumns）
function computeOverseaMultiLangValues(args: {
    name?: string;
    columns?: Section[];
    transformedColumns: any[];
    toolColumns?: SectionChildren[];
    multiLangColumns?: { [lang: string]: { sort: number; name: string; columns: any[] } };
    multiLangToolColumns?: { [lang: string]: { sort: number; name: string; columns: any[] } };
}) {
    const { name, columns, transformedColumns, toolColumns, multiLangColumns, multiLangToolColumns } = args;
    const fallbackColumns: { [k: string]: { sort: number; name: string; columns: any[] } } = {
        'en-US': { sort: 0, name: name ?? '', columns: columns ? transformedColumns : [ DefaultSections ] },
    };
    const fallbackToolColumns: { [k: string]: { sort: number; name: string; columns: any[] } } = {
        'en-US': {
            sort: 0,
            name: name ?? '',
            columns: toolColumns ? toolColumns : [ DefaultSectionsChildren ],
        },
    };
    const finalMultiLangColumns =
        multiLangColumns && Object.keys(multiLangColumns).length ? multiLangColumns : fallbackColumns;
    const finalMultiLangToolColumns =
        multiLangToolColumns && Object.keys(multiLangToolColumns).length ? multiLangToolColumns : fallbackToolColumns;
    const allLangs = Array.from(
        new Set([ ...Object.keys(finalMultiLangColumns), ...Object.keys(finalMultiLangToolColumns), 'en-US' ])
    );
    const sortedLangs = sortBy(
        allLangs,
        lang => finalMultiLangColumns[lang]?.sort ?? finalMultiLangToolColumns[lang]?.sort ?? 99
    );
    return {
        multiLang: sortedLangs.map(lang => ({ language: lang })),
        multiLangColumns: mapValues(
            Object.fromEntries(sortedLangs.map(lang => [ lang, finalMultiLangColumns[lang] ])),
            (v, lang) => v ?? { sort: sortedLangs.indexOf(lang), name: '', columns: [ DefaultSections ] }
        ),
        multiLangToolColumns: mapValues(
            Object.fromEntries(sortedLangs.map(lang => [ lang, finalMultiLangToolColumns[lang] ])),
            (v, lang) => v ?? { sort: sortedLangs.indexOf(lang), name: '', columns: [ DefaultSectionsChildren ] }
        ),
    };
}

function CreatePedia(props: CreatePediaProps) {
    const {
        strategyGroupLoading,
        strategyGroupOptions,
        setStrategyGroupOptions,
        visible,
        data,
        userName,
        clubBoardOptions,
        onOk,
        onCancel,
        clubDeployVersion,
        languageOptions,
        langMap,
    } = props;
    const [ form ] = Form.useForm();
    const [ loading, setLoading ] = useState(false);
    const [ manageCyclopediaVisible, setManageCyclopediaVisible ] = useState(false);

    const isCreate = useMemo(() => !data?.id, [ data ]);
    const isHomeLand = useMemo(() => (data?.boardId ?? '').startsWith('zh'), [ data ]);

    const [ pediaType, setPediaType ] = useState<PEDIA_TYPE>(data?.type ?? PEDIA_TYPE.Post);
    const [ activeKey, setActiveKey ] = useState<string>('zh-CN');

    useEffect(() => {
        setActiveKey(isHomeLand ? 'zh-CN' : 'en-US');
    }, [ isHomeLand ]);

    const domScrollHandle = useCallback((selectors: string) => {
        const el = document.querySelector(selectors);
        if (el) {
            el.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'center',
            });
        }
    }, []);

    // 定位form错误位置，Form.List才需要自己滚动，普通情况下使用scrollToFirstError={
    // {
    //                 behavior: (actions): any => {
    //                     if (!actions.length) {
    //                         return;
    //                     }
    //                     actions[0].el.scrollTo({
    //                         top: actions[0].top + 32,
    //                     });
    //                 },
    //             }
    // }
    const locationError = useCallback(
        (errorInfo: ValidateErrorEntity<any>) => {
            if (!errorInfo?.errorFields?.length) {
                return;
            }
            // 先按照页面显示顺序排序
            const sortErrorFieldsList = errorInfo?.errorFields.sort((a, b) => Number(a.name[1]) - Number(b.name[1]));
            const singleName = sortErrorFieldsList[0].name[0] as string;
            const trategySettingsFirstKeyList = [ 'toolColumns', 'columns' ];
            const trategyMultiLangKeyList = [ 'multiLangColumns', 'multiLangToolColumns' ];

            // 海外多语言路径：[multiLangColumns, lang, columns, idx, name?] / [..., columns, idx, children, cidx, name]
            if (trategyMultiLangKeyList.includes(singleName)) {
                const multiLangErrItem = sortErrorFieldsList.find(item =>
                    trategyMultiLangKeyList.includes(item.name[0] as string)
                );
                if (multiLangErrItem) {
                    const lang = multiLangErrItem.name[1] as string;
                    if (lang) {
                        setActiveKey(lang);
                    }
                    // [multiLangColumns, lang, name] —— 多语言模块名称错误
                    if (multiLangErrItem.name[2] === 'name') {
                        return setTimeout(() => {
                            domScrollHandle('#encyclopedia-create-form-id .trategy-settings-form-item');
                        }, 20);
                    }
                    // [multiLangColumns, lang, columns, idx, ...]
                    const parentKey = multiLangErrItem.name[3];
                    const childrenSegment = multiLangErrItem.name[4];
                    if (childrenSegment === 'children' && multiLangErrItem.name?.length === 7) {
                        const childrenKey = multiLangErrItem.name[5];
                        return setTimeout(() => {
                            domScrollHandle(
                                `#encyclopedia-create-form-id .trategy-settings-form-item .club__pedia__form-list__children_${parentKey} [data-row-key="${childrenKey}"]`
                            );
                        }, 20);
                    }
                    if (parentKey !== undefined) {
                        return setTimeout(() => {
                            domScrollHandle(
                                `#encyclopedia-create-form-id .trategy-settings-form-item [data-row-key="${parentKey}"]`
                            );
                        }, 20);
                    }
                }
            }

            /** 模板类型字段以上的字段表单滚动 */
            if (sortErrorFieldsList[0] && !trategySettingsFirstKeyList.includes(singleName)) {
                return domScrollHandle(`#encyclopedia-create-form-id #${singleName}`);
            }
            /**  模板类型为工具、攻略和帖子时的表单滚动 */
            // ["toolColumns",0,"name"] ['columns', 0, 'name']
            const parentErrItem = sortErrorFieldsList.find(
                item => trategySettingsFirstKeyList.includes(item.name[0] as string) && !!item.name[2]
            );
            // 表示是攻略设置的一级表单
            if (parentErrItem && parentErrItem.name?.length === 3) {
                const key = parentErrItem.name[1];
                return domScrollHandle(
                    `#encyclopedia-create-form-id .trategy-settings-form-item [data-row-key="${key}"]`
                );
            }
            // ['columns', 0, 'children', 8, 'name']
            const childrenErrItem = sortErrorFieldsList.find(
                item => item.name[0] === 'columns' && item.name[2] === 'children' && item.name[4]
            );
            // 表示是攻略设置的子级表单
            if (childrenErrItem && childrenErrItem.name?.length === 5) {
                const parentKey = childrenErrItem.name[1];
                const childrenKey = childrenErrItem.name[3];
                return domScrollHandle(
                    `#encyclopedia-create-form-id .trategy-settings-form-item .club__pedia__form-list__children_${parentKey} [data-row-key="${childrenKey}"]`
                );
            }
        },
        [ domScrollHandle ]
    );

    const { handleSubmit, handleReset } = usePersistantFunction({
        handleSubmit: async () => {
            try {
                const values = await form.validateFields();
                const {
                    boardId: _boardId,
                    columns,
                    toolColumns,
                    type,
                    multiLang,
                    multiLangColumns,
                    multiLangToolColumns,
                    ...rest
                } = values;
                const boardId = _boardId.split(BOARD_PERMIT_SEPARATE)[1];

                const transformColumns = (cols: Section[] = []): any[] =>
                    cols.map((item: Section) => ({
                        ...item,
                        children: item.children?.map((childItem: SectionChildren) => {
                            if (type === PEDIA_TYPE.Post) {
                                return { ...omit(childItem, [ 'link' ]), postId: extractId(childItem.postTitle || 0) };
                            } else {
                                return omit(childItem, [ 'postId' ]);
                            }
                        }),
                    }));

                let payloadColumns: any[] = [];
                let payloadToolColumns: any[] | undefined;
                let payloadMultiLangColumns:
                    | { [lang: string]: { sort: number; name: string; columns: any[] } }
                    | undefined;
                let payloadMultiLangToolColumns:
                    | { [lang: string]: { sort: number; name: string; columns: any[] } }
                    | undefined;

                if (isHomeLand) {
                    payloadColumns = transformColumns(columns || []);
                    payloadToolColumns = toolColumns;
                } else {
                    // multiLang 字段未通过 Form.Item 注册，validateFields() 不会返回，需用 getFieldValue 读取
                    const multiLangList: Array<{ language: string }> =
                        multiLang || form.getFieldValue('multiLang') || [];
                    const langs: string[] = multiLangList.map(m => m.language);
                    payloadMultiLangColumns = mapValues(multiLangColumns || {}, (v, lang) => ({
                        sort: Math.max(langs.indexOf(lang), 0),
                        name: v?.name ?? '',
                        columns: transformColumns(v?.columns || []),
                    }));
                    payloadMultiLangToolColumns = mapValues(multiLangToolColumns || {}, (v, lang) => ({
                        sort: Math.max(langs.indexOf(lang), 0),
                        name: v?.name ?? '',
                        columns: v?.columns || [],
                    }));
                    payloadColumns = payloadMultiLangColumns['en-US']?.columns ?? [];
                    payloadToolColumns = payloadMultiLangToolColumns['en-US']?.columns ?? [];
                }

                const baseParams: any = {
                    boardId,
                    type,
                    columns: payloadColumns,
                    toolColumns: payloadToolColumns,
                    ...rest,
                };
                // 国内/海外都要传 groupId（海外取自后端返回的唯一攻略组）
                baseParams.groupId = rest.groupId;
                if (!isHomeLand) {
                    baseParams.multiLangColumns = payloadMultiLangColumns;
                    baseParams.multiLangToolColumns = payloadMultiLangToolColumns;
                    // 海外版块根级 name 取自 en-US 的多语言 name（按 type 选取来源）
                    baseParams.name =
                        type !== PEDIA_TYPE.Toolbox
                            ? payloadMultiLangColumns!['en-US']?.name ?? ''
                            : payloadMultiLangToolColumns!['en-US']?.name ?? '';
                }

                if (isCreate) {
                    Modal.confirm({
                        title: `确定要新增该攻略吗？`,
                        onOk: async () => {
                            const { code, msg } = await addPedia(
                                { boardId },
                                {
                                    ...baseParams,
                                    creator: userName,
                                },
                                clubDeployVersion
                            );
                            if (code === 0) {
                                message.success('新建成功');
                                onOk && onOk({ boardId });
                            } else {
                                message.error(msg || '新建失败');
                            }
                        },
                    });
                } else {
                    const { code, msg } = await updatePedia(
                        { boardId },
                        {
                            ...baseParams,
                            id: data!.id,
                            updateBy: userName,
                        },
                        clubDeployVersion
                    );
                    if (code === 0) {
                        message.success('编辑成功');
                        onOk && onOk({ boardId });
                    } else {
                        message.error(msg || '编辑失败');
                    }
                }
            } catch (err) {
                console.error('error', err);
                locationError(err as ValidateErrorEntity<any>);
            } finally {
                setLoading(false);
            }
        },
        handleReset: () => {
            const { boardId, name, columns } = data;
            form.setFieldsValue({
                boardId,
                name,
                columns: columns ? columns : [ DefaultSections ],
            });
        },
    });

    useEffect(() => {
        if (visible && data) {
            const {
                boardId,
                name,
                columns,
                toolColumns,
                type,
                showType,
                groupId,
                multiLangColumns,
                multiLangToolColumns,
            } = data;
            const _columns = (columns || [])?.map(item => ({
                ...item,
                children: item.children?.map(childItem => {
                    return childItem?.postId ? childItem : omit(childItem, [ 'postId' ]);
                }),
            }));

            const baseValues: any = {
                boardId,
                groupId,
                name,
                columns: columns ? _columns : [ DefaultSections ],
                toolColumns: toolColumns ? toolColumns : [ DefaultSectionsChildren ],
                type: type ?? PEDIA_TYPE.Pedia,
                showType: showType ?? PEDIA_SHOW_TYPE.Small,
            };

            const isOversea = !((boardId ?? '') as string).startsWith('zh');
            // 海外版块新建时 groupId 由接口返回的唯一攻略组兜底
            if (isOversea && !groupId && strategyGroupOptions.length) {
                baseValues.groupId = strategyGroupOptions[0].value;
            }
            if (isOversea) {
                // 还原 multiLangColumns / multiLangToolColumns；首次没数据时用根字段兜底到 en-US
                // 仅 en-US 是必备语种，其他语种（含 zh-CN）由用户按需添加
                Object.assign(
                    baseValues,
                    computeOverseaMultiLangValues({
                        name,
                        columns,
                        transformedColumns: _columns,
                        toolColumns,
                        multiLangColumns,
                        multiLangToolColumns,
                    })
                );
            }

            form.setFieldsValue(baseValues);
            setPediaType(type);
        }
    }, [ data, form, isCreate, visible, strategyGroupOptions ]);
    const manageCyclopediaAddHandle = useCallback(() => {
        try {
            setManageCyclopediaVisible(true);
        } catch (error) {}
    }, []);

    // 监听选项被删除就重置表单项值
    useEffect(() => {
        watchStrategyGroupHandle(form, strategyGroupOptions);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ strategyGroupOptions ]);

    return (
        <Drawer
            getContainer={useContentDialogContainer()}
            width={900}
            title={`${isCreate ? '新增' : '编辑'}攻略`}
            visible={visible}
            onClose={() => {
                onCancel?.();
                form.resetFields();
            }}
            footer={[
                <Button
                    style={{ float: 'right', marginRight: 16 }}
                    key="0"
                    type="primary"
                    loading={loading}
                    onClick={() => handleSubmit()}
                >
                    提交
                </Button>,
                <Button style={{ float: 'right', marginRight: 16 }} key="1" onClick={() => handleReset()}>
                    重置
                </Button>,
            ]}
            className="create-pedia-drawer"
        >
            <Form
                form={form}
                id="encyclopedia-create-form-id"
                labelCol={{ span: 3 }}
                initialValues={{ type: PEDIA_TYPE.Pedia, showType: PEDIA_SHOW_TYPE.Small }}
            >
                <Form.Item name="boardId" label="所属版块" required>
                    <Select className="q1-form-item-xl" disabled>
                        {clubBoardOptions?.map(item =>
                            item?.children?.length ? (
                                <Select.OptGroup label={item.label} key={item.value}>
                                    {item.children.map(childItem => (
                                        <Select.Option value={childItem.value} key={childItem.value}>
                                            {childItem.label}
                                        </Select.Option>
                                    ))}
                                </Select.OptGroup>
                            ) : null
                        )}
                    </Select>
                </Form.Item>
                {isHomeLand ? (
                    <Form.Item required label="所属攻略组">
                        <Space>
                            <Form.Item
                                noStyle
                                name="groupId"
                                rules={[
                                    {
                                        required: true,
                                        message: '不能为空',
                                    },
                                ]}
                            >
                                <Select
                                    loading={strategyGroupLoading}
                                    className="q1-form-item-xl"
                                    placeholder="请选择"
                                    options={strategyGroupOptions}
                                />
                            </Form.Item>
                            <Button
                                type="text"
                                icon={<FormOutlined style={{ cursor: 'pointer' }} />}
                                onClick={manageCyclopediaAddHandle}
                                loading={strategyGroupLoading}
                            />
                        </Space>
                    </Form.Item>
                ) : (
                    // 海外版块每个版块只会有一个攻略组：UI 不展示，但保留 groupId 字段以便编辑场景透传
                    <Form.Item noStyle name="groupId">
                        <Input type="hidden" />
                    </Form.Item>
                )}
                {isHomeLand && (
                    <Form.Item
                        name="name"
                        label="模块名称"
                        rules={[
                            {
                                required: true,
                                message: '不能为空',
                            },
                        ]}
                    >
                        <Input className="q1-form-item-xl" placeholder="输入模块名称" maxLength={MAX_NAME_LENGTH} />
                    </Form.Item>
                )}
                <Form.Item
                    name="type"
                    label="模块类型"
                    rules={[
                        {
                            required: true,
                            message: '不能为空',
                        },
                    ]}
                >
                    <Select
                        className="q1-form-item-xl"
                        options={PediaTypeOptions}
                        onChange={(value: PEDIA_TYPE) => {
                            setPediaType(value);
                            if (isHomeLand) {
                                if (value === PEDIA_TYPE.Toolbox) {
                                    form.setFields([
                                        {
                                            name: 'toolColumns',
                                            value: [ DefaultSectionsChildren ],
                                        },
                                    ]);
                                } else {
                                    form.setFields([
                                        {
                                            name: 'columns',
                                            value: [ DefaultSections ],
                                        },
                                    ]);
                                }
                            } else {
                                // 海外：同步重置所有语种的 multiLangColumns / multiLangToolColumns，name 一并清空
                                const multiLang: Array<{ language: string }> = form.getFieldValue('multiLang') || [];
                                const langs = multiLang.map(m => m.language);
                                if (value === PEDIA_TYPE.Toolbox) {
                                    const next = langs.reduce((acc, lang, i) => {
                                        acc[lang] = { sort: i, name: '', columns: [ DefaultSectionsChildren ] };
                                        return acc;
                                    }, {} as { [k: string]: { sort: number; name: string; columns: any[] } });
                                    form.setFields([ { name: 'multiLangToolColumns', value: next } ]);
                                } else {
                                    const next = langs.reduce((acc, lang, i) => {
                                        acc[lang] = { sort: i, name: '', columns: [ DefaultSections ] };
                                        return acc;
                                    }, {} as { [k: string]: { sort: number; name: string; columns: any[] } });
                                    form.setFields([ { name: 'multiLangColumns', value: next } ]);
                                }
                            }
                        }}
                    />
                </Form.Item>
                <Form.Item noStyle shouldUpdate={(prev, next) => prev.type !== next.type}>
                    {({ getFieldValue }) => {
                        const type = getFieldValue('type');
                        if (type === PEDIA_TYPE.Pedia) {
                            return (
                                <Form.Item
                                    name="showType"
                                    label="展示方式"
                                    rules={[
                                        {
                                            required: true,
                                            message: '不能为空',
                                        },
                                    ]}
                                >
                                    <Radio.Group options={PediaShowTypeOptions} />
                                </Form.Item>
                            );
                        }
                        return null;
                    }}
                </Form.Item>
                <>{!isHomeLand ? <BlockHeader title="按语种配置内容" hasBottom></BlockHeader> : null}</>
                {isHomeLand ? (
                    <Form.Item
                        label="攻略设置"
                        className="trategy-settings-form-item"
                        shouldUpdate={(prev, next) => prev.type !== next.type}
                        required
                    >
                        {({ getFieldValue }) => {
                            const type = getFieldValue('type');
                            if (type !== PEDIA_TYPE.Toolbox) {
                                return (
                                    <Form.List name="columns">
                                        {(fields, { add, remove, move }) => {
                                            return (
                                                <SecetionItem
                                                    pediaType={pediaType}
                                                    boardId={data?.boardId?.split(BOARD_PERMIT_SEPARATE)[1]}
                                                    clubDeployVersion={clubDeployVersion}
                                                    form={form}
                                                    isCreate={isCreate}
                                                    fields={fields}
                                                    add={add}
                                                    remove={remove}
                                                    move={move}
                                                />
                                            );
                                        }}
                                    </Form.List>
                                );
                            }
                            return (
                                <Form.List name="toolColumns">
                                    {(fields, { add, remove, move }) => {
                                        return (
                                            <div className="form-list">
                                                <SectionsChildren
                                                    pediaType={pediaType}
                                                    isCreate={isCreate}
                                                    index={0}
                                                    fields={fields}
                                                    form={form}
                                                    add={add}
                                                    remove={remove}
                                                    move={move}
                                                    clubDeployVersion={clubDeployVersion}
                                                />
                                            </div>
                                        );
                                    }}
                                </Form.List>
                            );
                        }}
                    </Form.Item>
                ) : (
                    <Form.Item
                        noStyle
                        shouldUpdate={(prev, next) =>
                            prev.type !== next.type ||
                            prev.multiLang !== next.multiLang ||
                            prev.multiLangColumns !== next.multiLangColumns ||
                            prev.multiLangToolColumns !== next.multiLangToolColumns
                        }
                    >
                        {({ getFieldValue }) => {
                            const type = getFieldValue('type');
                            // 海外版块：用 shouldUpdate + state 驱动 Tabs，避免嵌套 Form.List 给内部 name 加上前缀
                            const multiLang: Array<{ language: string }> = getFieldValue('multiLang') || [];
                            const updateMultiLang = (next: Array<{ language: string }>) => {
                                form.setFields([ { name: 'multiLang', value: next } ]);
                            };
                            return (
                                <Tabs
                                    activeKey={activeKey}
                                    onTabClick={setActiveKey}
                                    type="editable-card"
                                    addIcon={<div>+添加语种</div>}
                                    onEdit={(key, action: 'add' | 'remove') => {
                                        const currentMultiLang: Array<{ language: string }> =
                                            form.getFieldValue('multiLang') || [];
                                        if (action === 'add') {
                                            const ref = React.createRef<{ form: FormInstance }>();
                                            const options = languageOptions.map(v => ({
                                                ...v,
                                                disabled: currentMultiLang.some(k => k.language === v.value),
                                            }));
                                            Modal.confirm({
                                                icon: null,
                                                title: '添加语种',
                                                content: <LangSelectModal options={options} ref={ref} />,
                                                async onOk() {
                                                    const { language } =
                                                        (await ref.current?.form.validateFields()) ?? {};
                                                    const currentMultiLangColumns =
                                                        form.getFieldValue('multiLangColumns') || {};
                                                    const currentMultiLangToolColumns =
                                                        form.getFieldValue('multiLangToolColumns') || {};
                                                    const nextMultiLang = [ ...currentMultiLang ];
                                                    for (let i = 0; i < language.length; i++) {
                                                        const languageItem = language[i];
                                                        nextMultiLang.push({ language: languageItem });
                                                        const idx = nextMultiLang.length - 1;
                                                        currentMultiLangColumns[languageItem] = {
                                                            sort: idx,
                                                            name: '',
                                                            columns: [ DefaultSections ],
                                                        };
                                                        currentMultiLangToolColumns[languageItem] = {
                                                            sort: idx,
                                                            name: '',
                                                            columns: [ DefaultSectionsChildren ],
                                                        };
                                                    }
                                                    updateMultiLang(nextMultiLang);
                                                    form.setFields([
                                                        {
                                                            name: 'multiLangColumns',
                                                            value: { ...currentMultiLangColumns },
                                                        },
                                                        {
                                                            name: 'multiLangToolColumns',
                                                            value: { ...currentMultiLangToolColumns },
                                                        },
                                                    ]);
                                                },
                                            });
                                        } else {
                                            if (key === 'en-US') {
                                                // en-US 是必备语种，禁止移除
                                                return;
                                            }
                                            const idx = currentMultiLang.findIndex(v => v.language === key);
                                            if (idx >= 0) {
                                                const nextMultiLang = currentMultiLang.filter((_, i) => i !== idx);
                                                const currentMultiLangColumns = {
                                                    ...(form.getFieldValue('multiLangColumns') || {}),
                                                };
                                                const currentMultiLangToolColumns = {
                                                    ...(form.getFieldValue('multiLangToolColumns') || {}),
                                                };
                                                delete currentMultiLangColumns[key as string];
                                                delete currentMultiLangToolColumns[key as string];
                                                updateMultiLang(nextMultiLang);
                                                form.setFields([
                                                    { name: 'multiLangColumns', value: currentMultiLangColumns },
                                                    {
                                                        name: 'multiLangToolColumns',
                                                        value: currentMultiLangToolColumns,
                                                    },
                                                ]);
                                                if (activeKey === key && nextMultiLang.length) {
                                                    setActiveKey(nextMultiLang[0].language);
                                                }
                                            }
                                        }
                                    }}
                                >
                                    {multiLang.map(item => {
                                        const lang = item.language;
                                        return (
                                            <Tabs.TabPane
                                                closable={lang !== 'en-US'}
                                                forceRender
                                                tab={langMap[lang] || lang}
                                                key={lang}
                                            >
                                                <Form.Item
                                                    label="模块名称"
                                                    name={
                                                        type !== PEDIA_TYPE.Toolbox
                                                            ? [ 'multiLangColumns', lang, 'name' ]
                                                            : [ 'multiLangToolColumns', lang, 'name' ]
                                                    }
                                                    rules={[ { required: true, message: '不能为空' } ]}
                                                >
                                                    <Input
                                                        className="q1-form-item-xl"
                                                        placeholder="输入模块名称"
                                                        maxLength={MAX_NAME_LENGTH}
                                                    />
                                                </Form.Item>
                                                <Form.Item
                                                    label="攻略设置"
                                                    className="trategy-settings-form-item"
                                                    required
                                                >
                                                    {type !== PEDIA_TYPE.Toolbox ? (
                                                        <Form.List name={[ 'multiLangColumns', lang, 'columns' ]}>
                                                            {(innerFields, { add, remove, move }) => (
                                                                <SecetionItem
                                                                    pediaType={pediaType}
                                                                    boardId={
                                                                        data?.boardId?.split(BOARD_PERMIT_SEPARATE)[1]
                                                                    }
                                                                    clubDeployVersion={clubDeployVersion}
                                                                    form={form}
                                                                    isCreate={isCreate}
                                                                    fields={innerFields}
                                                                    add={add}
                                                                    remove={remove}
                                                                    move={move}
                                                                    rootPath={[ 'multiLangColumns', lang, 'columns' ]}
                                                                />
                                                            )}
                                                        </Form.List>
                                                    ) : (
                                                        <Form.List name={[ 'multiLangToolColumns', lang, 'columns' ]}>
                                                            {(innerFields, { add, remove, move }) => (
                                                                <div className="form-list">
                                                                    <SectionsChildren
                                                                        pediaType={pediaType}
                                                                        isCreate={isCreate}
                                                                        index={0}
                                                                        fields={innerFields}
                                                                        form={form}
                                                                        add={add}
                                                                        remove={remove}
                                                                        move={move}
                                                                        clubDeployVersion={clubDeployVersion}
                                                                        rootPath={[
                                                                            'multiLangToolColumns',
                                                                            lang,
                                                                            'columns',
                                                                        ]}
                                                                    />
                                                                </div>
                                                            )}
                                                        </Form.List>
                                                    )}
                                                </Form.Item>
                                            </Tabs.TabPane>
                                        );
                                    })}
                                </Tabs>
                            );
                        }}
                    </Form.Item>
                )}
            </Form>
            <ManageCyclopedia
                userName={userName}
                boardId={Number(data.boardId?.split(BOARD_PERMIT_SEPARATE)?.[1])}
                clubDeployVersion={clubDeployVersion}
                visible={manageCyclopediaVisible}
                setVisible={setManageCyclopediaVisible}
                list={strategyGroupOptions.map((item, i) => ({ id: item.value, sort: i, name: item.label as string }))}
                setList={setStrategyGroupOptions}
            />
        </Drawer>
    );
}

export default CreatePedia;

interface LangSelectModalProps {
    options: Array<{
        label: string;
        value: string;
        disabled?: boolean;
    }>;
}
const LangSelectModal = React.forwardRef((props: LangSelectModalProps, ref) => {
    const { options } = props;
    const [ form ] = Form.useForm();
    React.useImperativeHandle(ref, () => ({
        form,
    }));
    return (
        <Form form={form}>
            <Form.Item required rules={[ { required: true, message: '请选择' } ]} label="语种" name="language">
                <Select options={options} mode="multiple" placeholder="请选择一个语种" />
            </Form.Item>
        </Form>
    );
});
