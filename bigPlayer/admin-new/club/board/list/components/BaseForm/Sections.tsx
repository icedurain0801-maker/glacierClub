import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Form, FormInstance, Input, message, Select, Tooltip } from 'antd';
import { PlusCircleOutlined, PlusOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { get, isEqual, uniq, omit, cloneDeep } from 'lodash';
import type { Rule } from 'antd/es/form';
import type { FormListFieldData, FormListOperation } from 'antd/es/form/FormList';
import { arrayMoveImmutable as arrayMove } from 'array-move';

import SortableTable from '@/components/q1Table/sortableTable';
import NumberSwitch from '@/components/NumberSwitch';
import useSyncState from '@/components/UseSyncState';
import { getBoardSection } from '@/api/club';
import { FormOnlyVisiable } from '@/components/Q1DataEntry/Index';
import { falsityArr, normalRuleValidator } from '@/utils/lib';
import { useIsEqualState } from '@/context';
import { usePersistantFunction } from '@/hooks/state/useLatestValueRef';
import UploadImg from '@/components/uploadFile/UploadImg';
import ShareIcon from '@/assets/icon_share.png';
import SupportContributionButton from '@/components/SupportContributionButton';

import { BoardSectionType, MOMENT_TYPE, MomentTypeOptionsData } from '@ts/club';

import { BASIC_CHECK_STATUS, defaultData } from '../../defaultVal';
import { useClubUploadOption } from '../../../hooks/useClubUploadOption';
import { useBoardCreate } from '../../../context/boardCreateProvider';

/** 栏目名称字符数量 */
const SECTION_TITLE_LENGTH_MAX = 30;
/** 栏目数量 */
const SECTION_LENGTH_MAX = 10;

type RootName = Array<string | number>;

interface SectionsProps {
    isCreate?: boolean;
    index?: number;
    form: FormInstance;
    fields: FormListFieldData[];
    add: FormListOperation['add'];
    remove: FormListOperation['remove'];
    move: FormListOperation['move'];
    ClubUploadOption: ReturnType<typeof useClubUploadOption>;
    lang: string;
    rootName?: RootName;
    isIndependent?: boolean;
}

function appendNamePath(base: RootName, ...rest: Array<string | number>) {
    return [ ...base, ...rest ];
}

function getDefaultSection(isIndependent: boolean, lang: string) {
    const section = cloneDeep(get(defaultData, 'sections.0'));
    return {
        ...(!isIndependent ? section : omit(section, 'multiLang')),
        ...(isIndependent ? { lang } : {}),
        children: (section.children || []).map((child: any) => ({
            ...(!isIndependent ? child : omit(child, 'multiLang')),
            ...(isIndependent ? { lang } : {}),
        })),
    };
}

function getDefaultChild(type: MOMENT_TYPE, isIndependent: boolean, lang: string) {
    return {
        name: '',
        iconUrl: '',
        isAdmin: BASIC_CHECK_STATUS.Close,
        status: BASIC_CHECK_STATUS.Close,
        sort: 1,
        allEnable: BASIC_CHECK_STATUS.Open,
        defaultShare: BASIC_CHECK_STATUS.Close,
        type,
        ...(isIndependent ? { lang } : {}),
    };
}

function getNameValue(item: any, enableMultiLang: boolean, lang: string) {
    return enableMultiLang ? get(item, [ 'multiLang', lang, 'name' ]) : item?.name;
}

export function SectionsChildren(props: SectionsProps) {
    const {
        form,
        index: parentIndex = 0,
        add,
        remove,
        move,
        fields,
        isCreate,
        ClubUploadOption,
        lang,
        rootName = [ 'sections' ],
        isIndependent = false,
    } = props;

    const [ removeBtnLoading, setRemoveBtnLoading ] = useSyncState(false);
    const equaledFields = useIsEqualState(fields, isEqual);
    const { handleEqualedAdd, handleEqualedMove, handleEqualedRemove } = usePersistantFunction({
        handleEqualedAdd: add,
        handleEqualedRemove: remove,
        handleEqualedMove: move,
    });
    const { isEN } = useBoardCreate();
    const enableMultiLang = isEN && !isIndependent;

    const handleSectionRemove = useCallback(
        async (index: number) => {
            if (removeBtnLoading) {
                return;
            }
            try {
                const id = form.getFieldValue(appendNamePath(rootName, parentIndex, 'children', index, 'id'));
                if (id) {
                    setRemoveBtnLoading(true);
                    const clubDeployVersion = form.getFieldValue('clubDeployVersion');
                    const { data = false } = await getBoardSection({ ids: id }, clubDeployVersion);
                    if (data === null) {
                        handleEqualedRemove(index);
                    } else {
                        message.error('当前资讯栏目下帖子数不为空，不可删除！');
                    }
                } else {
                    handleEqualedRemove(index);
                }
            } finally {
                setRemoveBtnLoading(false);
            }
        },
        [ form, handleEqualedRemove, parentIndex, removeBtnLoading, rootName, setRemoveBtnLoading ]
    );

    const onChangeSort = useCallback(
        ({ oldIndex, newIndex }) => {
            handleEqualedMove(oldIndex, newIndex);
        },
        [ handleEqualedMove ]
    );

    const handleAdd = useCallback(() => {
        const sections = form.getFieldValue(rootName) || [];
        handleEqualedAdd({
            ...getDefaultChild(get(sections, [ parentIndex, 'type' ]), isIndependent, lang),
        });
    }, [ form, handleEqualedAdd, isIndependent, lang, parentIndex, rootName ]);

    return useMemo(() => {
        const columns: ColumnsType<FormListFieldData> = [
            {
                title: '资讯栏目',
                key: 'name',
                width: 260,
                render: (_, record) => {
                    return (
                        <div className="section-child-name-cell">
                            <Form.Item
                                noStyle
                                shouldUpdate={(pre, cur) =>
                                    get(
                                        pre,
                                        appendNamePath(rootName, parentIndex, 'children', record.name, 'defaultShare')
                                    ) !==
                                    get(
                                        cur,
                                        appendNamePath(rootName, parentIndex, 'children', record.name, 'defaultShare')
                                    )
                                }
                            >
                                {({ getFieldValue }) => {
                                    const defaultShare = getFieldValue(
                                        appendNamePath(rootName, parentIndex, 'children', record.name, 'defaultShare')
                                    );
                                    return defaultShare === BASIC_CHECK_STATUS.Open ? (
                                        <Tooltip title="游戏截图默认分享至社区的栏目">
                                            <img style={{ cursor: 'pointer' }} src={ShareIcon} width={18} alt="" />
                                        </Tooltip>
                                    ) : (
                                        ''
                                    );
                                }}
                            </Form.Item>

                            <div className="upload-item" style={{ width: 38 }}>
                                <Form.Item {...record} name={[ record.name, 'iconUrl' ]}>
                                    <UploadImg
                                        uploadButton={<PlusOutlined />}
                                        uploadOption={ClubUploadOption}
                                        maxSize={1024 * 1024}
                                        sizeType="small"
                                        accept="image/png,image/jpeg"
                                        isRandomFileName
                                    />
                                </Form.Item>
                            </div>
                            <Form.Item
                                {...record}
                                name={
                                    enableMultiLang ? [ record.name, 'multiLang', lang, 'name' ] : [ record.name, 'name' ]
                                }
                                fieldKey={
                                    enableMultiLang
                                        ? [ record.fieldKey, 'multiLang', lang, 'name' ]
                                        : [ record.fieldKey, 'name' ]
                                }
                                rules={normalRuleValidator('请输入')}
                                normalize={val => val?.trim()}
                            >
                                <Input maxLength={SECTION_TITLE_LENGTH_MAX} allowClear style={{ width: 150 }} />
                            </Form.Item>
                        </div>
                    );
                },
            },
            {
                title: '管理专用',
                key: 'isAdmin',
                width: 88,
                render: (_, record) => (
                    <Form.Item
                        {...record}
                        name={[ record.name, 'isAdmin' ]}
                        fieldKey={[ record.fieldKey, 'isAdmin' ]}
                        rules={normalRuleValidator('请选择')}
                    >
                        <NumberSwitch />
                    </Form.Item>
                ),
            },
            {
                title: '是否启用',
                key: 'status',
                width: 88,
                render: (_, record) => (
                    <Form.Item
                        {...record}
                        name={[ record.name, 'status' ]}
                        fieldKey={[ record.fieldKey, 'status' ]}
                        rules={normalRuleValidator('请选择')}
                    >
                        <NumberSwitch />
                    </Form.Item>
                ),
            },
            {
                title: (
                    <div>
                        全部可见
                        <Tooltip title="当前栏目的内容是否在全部里显示（资讯的“全部”，好友圈的“置顶动态和最新动态”）">
                            <QuestionCircleOutlined style={{ cursor: 'pointer', marginLeft: 4 }} />
                        </Tooltip>
                    </div>
                ),
                key: 'allEnable',
                width: 95,
                render: (_, record) => (
                    <Form.Item
                        {...record}
                        name={[ record.name, 'allEnable' ]}
                        fieldKey={[ record.fieldKey, 'allEnable' ]}
                        rules={normalRuleValidator('请选择')}
                    >
                        <NumberSwitch />
                    </Form.Item>
                ),
            },
            {
                title: '操作',
                key: 'ops_action',
                width: 60,
                render: (_, record, childIndex) => (
                    <div style={{ display: 'flex' }}>
                        <Form.Item
                            label="类别类型"
                            {...record}
                            name={[ record.name, 'type' ]}
                            fieldKey={[ record.fieldKey, 'type' ]}
                            key={record.key + 'type'}
                            hidden
                        >
                            <></>
                        </Form.Item>
                        {!isCreate && (
                            <Form.Item
                                hidden
                                {...record}
                                name={[ record.name, 'id' ]}
                                fieldKey={[ record.fieldKey, 'id' ]}
                                key={record.key + 'id'}
                            >
                                <FormOnlyVisiable />
                            </Form.Item>
                        )}
                        {equaledFields?.length > 1 ? (
                            <Button
                                type="link"
                                danger
                                loading={removeBtnLoading}
                                onClick={() => handleSectionRemove(childIndex)}
                            >
                                移除
                            </Button>
                        ) : null}
                        <Form.Item
                            noStyle
                            shouldUpdate={(pre, cur) =>
                                get(
                                    pre,
                                    appendNamePath(rootName, parentIndex, 'children', record.name, 'defaultShare')
                                ) !==
                                get(cur, appendNamePath(rootName, parentIndex, 'children', record.name, 'defaultShare'))
                            }
                        >
                            {({ getFieldValue }) => {
                                const defaultShare = getFieldValue(
                                    appendNamePath(rootName, parentIndex, 'children', record.name, 'defaultShare')
                                );
                                return defaultShare === BASIC_CHECK_STATUS.Open ? (
                                    ''
                                ) : (
                                    <Button
                                        type="link"
                                        onClick={() => {
                                            const children = (
                                                getFieldValue(appendNamePath(rootName, parentIndex, 'children')) || []
                                            ).map((item: { defaultShare: BASIC_CHECK_STATUS }, i: number) => ({
                                                ...item,
                                                defaultShare:
                                                    record.name === i
                                                        ? BASIC_CHECK_STATUS.Open
                                                        : BASIC_CHECK_STATUS.Close,
                                            }));
                                            const sections = (
                                                getFieldValue(rootName) || []
                                            ).map((item: { children: any[] }, i: number) =>
                                                i === parentIndex ? { ...item, children } : item
                                            );
                                            form.setFields([ { name: rootName, value: sections } ]);
                                        }}
                                    >
                                        设为分享
                                    </Button>
                                );
                            }}
                        </Form.Item>
                    </div>
                ),
            },
        ];

        return (
            <SortableTable
                helperClass="row-dragging-club__board"
                onChangeSort={onChangeSort}
                dataSource={equaledFields}
                className="club__board__form-list__children"
                columns={columns}
                pagination={false}
                size="small"
                scroll={{ x: 600 }}
                locale={{ emptyText: '暂无数据' }}
                rowKey="key"
                footer={() =>
                    equaledFields?.length < SECTION_LENGTH_MAX ? (
                        <Button block onClick={handleAdd} icon={<PlusCircleOutlined />}>
                            添加子类
                        </Button>
                    ) : null
                }
            />
        );
    }, [
        ClubUploadOption,
        enableMultiLang,
        equaledFields,
        form,
        handleAdd,
        handleSectionRemove,
        isCreate,
        lang,
        onChangeSort,
        parentIndex,
        removeBtnLoading,
        rootName,
    ]);
}

interface SecetionItemProps {
    isCreate?: boolean;
    submitTime?: number;
    form: FormInstance;
    fields: FormListFieldData[];
    add: FormListOperation['add'];
    remove: FormListOperation['remove'];
    move: FormListOperation['move'];
    ClubUploadOption: ReturnType<typeof useClubUploadOption>;
    lang: string;
    rootName?: RootName;
    isIndependent?: boolean;
}

export function SecetionItem(props: SecetionItemProps) {
    const {
        form,
        isCreate,
        fields,
        submitTime,
        ClubUploadOption,
        lang,
        rootName = [ 'sections' ],
        isIndependent = false,
    } = props;

    const equaledFields = useIsEqualState(fields, isEqual);
    const [ handleRemoveTime, setHandleRemoveTime ] = useState(Date.now());
    const [ removeBtnLoading, setRemoveBtnLoading ] = useSyncState(false);
    /** 展开的key */
    const [ expandedRowKeys, setExpandedRowKeys ] = useState<number[]>([]);
    /** 记录上一次提交的时间，方便提交再次全部展开本栏目 */
    const currentTime = useRef(0);
    /** 非展开的key,方便记录新增fields数据全部重新渲染 */
    const excludeKeys = useRef<number[]>([]);

    const { isEN } = useBoardCreate();
    const enableMultiLang = isEN && !isIndependent;

    useEffect(() => {
        if (submitTime !== currentTime.current) {
            setExpandedRowKeys(equaledFields?.map(x => x.key));
            excludeKeys.current = [];
        } else {
            setExpandedRowKeys(equaledFields?.filter(x => !excludeKeys.current.includes(x.key)).map(x => x.key) || []);
        }
        currentTime.current = submitTime || 0;
    }, [ equaledFields, submitTime ]);

    const handleAdd = useCallback(() => {
        const sections = form.getFieldValue(rootName) || [];
        form.setFields([ { name: rootName, value: [ ...sections, getDefaultSection(isIndependent, lang) ] } ]);
        setHandleRemoveTime(Date.now());
    }, [ form, isIndependent, lang, rootName ]);

    const removeSection = useCallback(
        index => {
            const sections = form.getFieldValue(rootName) || [];
            form.setFields([ { name: rootName, value: sections.filter((_: any, xi: number) => xi !== index) } ]);
            setHandleRemoveTime(Date.now());
        },
        [ form, rootName ]
    );

    const handleRemove = useCallback(
        async index => {
            if (removeBtnLoading) {
                return;
            }
            try {
                const clubDeployVersion = form.getFieldValue('clubDeployVersion');
                const currentSection = form.getFieldValue(appendNamePath(rootName, index)) || {};
                let ids: any[] = [
                    currentSection.id,
                    ...(currentSection.children || []).map((item: BoardSectionType) => item?.id),
                ];
                ids = ids.filter(Boolean);
                if (ids.length) {
                    setRemoveBtnLoading(true);
                    const { data = false } = await getBoardSection({ ids: ids.join(',') }, clubDeployVersion);
                    if (data === null) {
                        removeSection(index);
                    } else {
                        message.error('当前资讯栏目下帖子数不为空，不可删除！');
                    }
                } else {
                    removeSection(index);
                }
            } finally {
                setRemoveBtnLoading(false);
            }
        },
        [ form, removeBtnLoading, removeSection, rootName, setRemoveBtnLoading ]
    );

    const handleTypeChange = useCallback(
        (index, value: MOMENT_TYPE) => {
            const sections: BoardSectionType[] = form.getFieldValue(rootName) || [];
            const isRender = [ MOMENT_TYPE.Post, MOMENT_TYPE.Feeling ].includes(value);
            const children = get(sections, [ index, 'children' ], []);
            if (isRender) {
                if (!children.length) {
                    form.setFields([
                        {
                            name: appendNamePath(rootName, index, 'children'),
                            value: [ getDefaultChild(value, isIndependent, lang) ],
                        },
                    ]);
                } else {
                    const fieldsValue = sections[index].children?.map((_: any, childIndex: number) => ({
                        name: appendNamePath(rootName, index, 'children', childIndex, 'type'),
                        value,
                    }));
                    fieldsValue && form.setFields(fieldsValue);
                }
            } else {
                form.setFields([ { name: appendNamePath(rootName, index, 'children'), value: undefined } ]);
            }
            setHandleRemoveTime(Date.now());
        },
        [ form, isIndependent, lang, rootName ]
    );

    const onExpand = useCallback(
        (expand: boolean, record: FormListFieldData) => {
            excludeKeys.current = uniq(
                expand ? excludeKeys.current.filter(x => x !== record.key) : [ ...excludeKeys.current, record.key ]
            );
            setExpandedRowKeys(
                uniq(expand ? [ ...expandedRowKeys, record.key ] : expandedRowKeys.filter(x => x !== record.key))
            );
        },
        [ expandedRowKeys ]
    );

    const rowExpandable = useCallback(
        (record: FormListFieldData) => {
            const type: MOMENT_TYPE = form.getFieldValue(appendNamePath(rootName, record.name, 'type')) || 0;
            return [ MOMENT_TYPE.Post, MOMENT_TYPE.Feeling ].includes(type);
        },
        [ form, rootName ]
    );

    const onChangeSort = useCallback(
        ({ oldIndex, newIndex }) => {
            const sections = form.getFieldValue(rootName) || [];
            form.setFields([ { name: rootName, value: arrayMove(sections, oldIndex, newIndex) } ]);
            setHandleRemoveTime(Date.now());
        },
        [ form, rootName ]
    );

    const expandedRowRender = useCallback(
        (record: FormListFieldData) => {
            const type: MOMENT_TYPE = form.getFieldValue(appendNamePath(rootName, record.name, 'type')) || 0;
            const isRender = [ MOMENT_TYPE.Post, MOMENT_TYPE.Feeling ].includes(type);
            return (
                <div style={{ display: isRender ? 'block' : 'none' }}>
                    <Form.List name={[ record.name, 'children' ]}>
                        {(fieldsData, { add, remove, move }) => (
                            <SectionsChildren
                                isCreate={isCreate}
                                index={record.name || 0}
                                fields={fieldsData}
                                form={form}
                                add={add}
                                remove={remove}
                                move={move}
                                ClubUploadOption={ClubUploadOption}
                                lang={lang}
                                rootName={rootName}
                                isIndependent={isIndependent}
                            />
                        )}
                    </Form.List>
                </div>
            );
        },
        [ ClubUploadOption, form, isCreate, isIndependent, lang, rootName ]
    );

    return useMemo(() => {
        const nameRepeatValidate = (index: number, required: boolean) => {
            return [
                {
                    validator: (_rule: Rule, value: string) => {
                        const list = form.getFieldValue(rootName) || [];
                        const names = list.map((item: any) => getNameValue(item, enableMultiLang, lang));
                        if (!value && required) {
                            return Promise.reject('请输入');
                        }
                        names.splice(index, 1);
                        if (names.findIndex((item: string) => item === value) !== -1) {
                            return Promise.reject('名字不能重复');
                        }
                        return Promise.resolve();
                    },
                },
            ];
        };

        const columns: ColumnsType<FormListFieldData> = [
            {
                key: 'section',
                title: '序号',
                align: 'center',
                width: 64,
                render: (_, record) => (
                    <>
                        {record.name + 1}
                        {!isCreate && (
                            <Form.Item hidden {...record} name={[ record.name, 'id' ]} fieldKey={[ record.fieldKey, 'id' ]}>
                                <FormOnlyVisiable />
                            </Form.Item>
                        )}
                    </>
                ),
            },
            {
                key: 'name',
                title: '类别名称',
                align: 'center',
                width: 180,
                render: (_, record, index) => (
                    <Form.Item
                        {...record}
                        name={enableMultiLang ? [ record.name, 'multiLang', lang, 'name' ] : [ record.name, 'name' ]}
                        fieldKey={
                            enableMultiLang ? [ record.fieldKey, 'multiLang', lang, 'name' ] : [ record.fieldKey, 'name' ]
                        }
                        rules={nameRepeatValidate(index, true)}
                        normalize={val => val?.trim()}
                    >
                        <Input maxLength={SECTION_TITLE_LENGTH_MAX} allowClear />
                    </Form.Item>
                ),
            },
            {
                key: 'type',
                title: '类别类型',
                align: 'center',
                width: 88,
                render: (_, record, index) => {
                    const currentSection = form.getFieldValue(appendNamePath(rootName, index));
                    return (
                        <Form.Item
                            {...record}
                            name={[ record.name, 'type' ]}
                            fieldKey={[ record.fieldKey, 'type' ]}
                            rules={[
                                {
                                    validator: (_v, val) => {
                                        if (falsityArr.includes(val)) {
                                            return Promise.reject('请选择');
                                        }
                                        return Promise.resolve();
                                    },
                                },
                            ]}
                        >
                            <Select
                                options={MomentTypeOptionsData}
                                onChange={handleTypeChange.bind(null, index)}
                                disabled={!!currentSection?.id}
                            />
                        </Form.Item>
                    );
                },
            },
            {
                key: 'status',
                title: '是否启用',
                align: 'center',
                width: 88,
                render: (_, record) => (
                    <>
                        <Form.Item
                            label="管理专用"
                            {...record}
                            name={[ record.name, 'isAdmin' ]}
                            fieldKey={[ record.fieldKey, 'isAdmin' ]}
                            key={record.key + 'isAdmin'}
                            rules={normalRuleValidator()}
                            hidden
                        >
                            <NumberSwitch checkedChildren="开启" unCheckedChildren="关闭" />
                        </Form.Item>
                        <Form.Item
                            noStyle
                            {...record}
                            name={[ record.name, 'status' ]}
                            fieldKey={[ record.fieldKey, 'status' ]}
                            key={record.key + 'status'}
                            rules={normalRuleValidator()}
                        >
                            <NumberSwitch checkedChildren="开启" unCheckedChildren="关闭" />
                        </Form.Item>
                    </>
                ),
            },
            {
                key: 'ops_action',
                title: '操作',
                align: 'center',
                width: 140,
                render: (_, record, index) => (
                    <>
                        <Form.Item
                            noStyle
                            shouldUpdate={(prev, next) =>
                                get(prev, appendNamePath(rootName, record.name, 'type')) !==
                                get(next, appendNamePath(rootName, record.name, 'type'))
                            }
                        >
                            {({ getFieldValue }) => {
                                const type = getFieldValue(appendNamePath(rootName, index, 'type'));
                                return type === MOMENT_TYPE.Post ? (
                                    <Form.Item name={[ record.name, 'isSubmittable' ]} noStyle>
                                        <SupportContributionButton
                                            cancelText="取消支持"
                                            supportText="支持投稿"
                                            buttonProps={{ type: 'link' }}
                                        />
                                    </Form.Item>
                                ) : null;
                            }}
                        </Form.Item>
                        {equaledFields?.length > 1 ? (
                            <Button danger type="link" loading={removeBtnLoading} onClick={() => handleRemove(index)}>
                                移除
                            </Button>
                        ) : null}
                    </>
                ),
            },
        ];

        return (
            <SortableTable
                key={handleRemoveTime}
                helperClass="row-dragging-club__board"
                className="club-board-sections-item form-list"
                dataSource={equaledFields}
                expandable={{
                    expandedRowKeys,
                    childrenColumnName: 'childrenColumnName',
                    defaultExpandAllRows: true,
                    expandedRowRender,
                    onExpand,
                    rowExpandable,
                }}
                onChangeSort={onChangeSort}
                columns={columns}
                pagination={false}
                size="small"
                scroll={{ x: 620 }}
                rowKey="key"
                footer={() =>
                    equaledFields?.length < SECTION_LENGTH_MAX ? (
                        <Button block onClick={handleAdd} icon={<PlusCircleOutlined />}>
                            添加类别
                        </Button>
                    ) : null
                }
            />
        );
    }, [
        enableMultiLang,
        equaledFields,
        expandedRowKeys,
        expandedRowRender,
        form,
        handleAdd,
        handleRemove,
        handleRemoveTime,
        handleTypeChange,
        isCreate,
        lang,
        onChangeSort,
        onExpand,
        removeBtnLoading,
        rootName,
        rowExpandable,
    ]);
}

export default SecetionItem;
