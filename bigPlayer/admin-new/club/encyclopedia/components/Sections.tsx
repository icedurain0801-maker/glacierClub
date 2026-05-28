import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Form, FormInstance, Input, message, Popover, Tooltip } from 'antd';
import { InfoCircleOutlined, PlusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { get, isEqual, uniq } from 'lodash';
import type { Rule } from 'antd/es/form';
import type { FormListFieldData, FormListOperation } from 'antd/es/form/FormList';
import arrayMove from 'array-move';

import SortableTable from '@/components/q1Table/sortableTable';
import NumberSwitch from '@/components/NumberSwitch';
import useSyncState from '@/components/UseSyncState';
import { getBoardSection } from '@/api/club';
import { FormOnlyVisiable } from '@/components/Q1DataEntry/Index';
import { normalRuleValidator } from '@/utils/lib';
import { useIsEqualState } from '@/context';
import { usePersistantFunction } from '@/hooks/state/useLatestValueRef';
import UploadImg from '@/components/uploadFile/UploadImg';

import { BoardSectionType, CLUB_DEPLOY_VERSION, MOMENT_TYPE, PEDIA_TYPE } from '@ts/club';

import { useClubUploadOption } from '../../board/hooks/useClubUploadOption';
import usePostSelect from '../../board/hooks/usePostSelect';
require('./sections.less');

export const DefaultSections = {
    name: '',
    enable: 1,
    sort: 0,
    children: [
        {
            name: '',
            status: 1,
            sort: 0,
        },
    ],
};

export const DefaultSectionsChildren = {
    name: '',
    status: 1,
    sort: 0,
};

/** 栏目名称字符数量 */
const SECTION_TITLE_LENGTH_MAX = 30;
/** 栏目最大数量 */
const SECTION_LENGTH_MAX = 10;
/** 攻略子项最大数量 */
const SECTION_CHILDREN_MAX = 20;

interface SectionsProps {
    boardId?: number | string;
    isCreate?: boolean;
    index?: number;
    className?: string;
    form: FormInstance;
    fields: FormListFieldData[];
    add: FormListOperation['add'];
    remove: FormListOperation['remove'];
    move: FormListOperation['move'];
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    pediaType: PEDIA_TYPE;
    /** form 字段绝对路径，默认 ['columns']；多语言场景传入对应语种的路径 */
    rootPath?: (string | number)[];
}

export function SectionsChildren(props: SectionsProps) {
    let {
        form,
        boardId,
        index: partentIndex = 0,
        add,
        remove,
        move,
        fields,
        clubDeployVersion,
        pediaType,
        rootPath = [ 'columns' ],
    } = props;
    const equaledFields = useIsEqualState(fields, isEqual);
    const { handleEqualedAdd, handleEqualedMove, handleEqualedRemove } = usePersistantFunction({
        handleEqualedAdd: add,
        handleEqualedRemove: remove,
        handleEqualedMove: move,
    });

    let ClubUploadOption = useClubUploadOption({ clubDeployVersion });
    const { selectNode } = usePostSelect({
        init: !!boardId,
        clubDeployVersion,
        boardId: boardId || -1,
        selectProps: {
            mode: undefined,
        },
        isTitleKey: true,
        postType: [ MOMENT_TYPE.Post ].join(','),
    });

    const onChangeSort = useCallback(
        ({ oldIndex, newIndex }) => {
            handleEqualedMove(oldIndex, newIndex);
        },
        [ handleEqualedMove ]
    );

    const handleAdd = useCallback(() => {
        let sections = form.getFieldValue(rootPath);
        handleEqualedAdd({
            name: '',
            isAdmin: 0,
            status: 1,
            sort: sections.length,
            type: get(sections, [ partentIndex, 'type' ]),
        });
        setTimeout(() => {
            const dom = document.querySelector(`.club__pedia__form-list__children_${partentIndex} .ant-table-body`);
            if (dom) {
                dom.scrollTop = dom.scrollHeight;
            }
        }, 0);
    }, [ form, handleEqualedAdd, partentIndex, rootPath ]);

    return useMemo(() => {
        let columns: ColumnsType<FormListFieldData> = [
            ...(pediaType !== PEDIA_TYPE.Post
                ? ([
                      {
                          title: '名称',
                          key: 'name',
                          render: (v, record) => {
                              return (
                                  <Form.Item
                                      {...record}
                                      name={[ record.name, 'name' ]}
                                      fieldKey={[ record.fieldKey, 'name' ]}
                                      rules={normalRuleValidator('请输入')}
                                      normalize={val => val?.trim()}
                                  >
                                      <Input maxLength={SECTION_TITLE_LENGTH_MAX} allowClear />
                                  </Form.Item>
                              );
                          },
                      },
                      {
                          key: 'pic',
                          title: '图标',
                          align: 'center',
                          width: 70,
                          render: field => {
                              return (
                                  <div className="upload-item">
                                      <Form.Item
                                          name={[ field?.name, 'pic' ]}
                                          fieldKey={[ field?.fieldKey, 'pic' ]}
                                          rules={normalRuleValidator('请上传', true)}
                                      >
                                          <UploadImg
                                              uploadButton={
                                                  <Tooltip title="建议：尺寸80*80，png/jpg格式，内存500kb以内">
                                                      <PlusOutlined />
                                                  </Tooltip>
                                              }
                                              uploadOption={ClubUploadOption}
                                              maxSize={512 * 1024}
                                              sizeType="small"
                                              accept="image/png,image/jpeg"
                                              isRandomFileName={true}
                                          />
                                      </Form.Item>
                                  </div>
                              );
                          },
                      },
                  ] as ColumnsType<any>)
                : []),
            {
                key: 'link',
                title:
                    pediaType === PEDIA_TYPE.Post ? (
                        '帖文'
                    ) : (
                        <Popover
                            content={
                                <div
                                    style={{
                                        maxWidth: '300px',
                                        whiteSpace: 'pre-line',
                                    }}
                                >
                                    <p>
                                        1. 跳转大玩家内部某个页面时，需配置页面地址相对路径（从第一个 /
                                        开头截取地址至末尾）
                                        例如：/pages/post/detail/index?id=145558&trigger=body&env=web&lang=zh-CN{' '}
                                    </p>
                                    <p>
                                        2. 跳转到外部网站时，需配置页面完整路径（包含 https:// ）
                                        例如：https://jifen-h5-test.q1.com/ld/activity/meetgift/index.html
                                    </p>
                                </div>
                            }
                        >
                            <span>链接地址</span> <InfoCircleOutlined />
                        </Popover>
                    ),
                align: 'center',
                width: 200,
                render: field => {
                    return (
                        <Form.Item shouldUpdate={(prev, next) => prev.type !== next.type} noStyle>
                            {({ getFieldValue }) => {
                                let type = getFieldValue('type');
                                if (type !== PEDIA_TYPE.Post) {
                                    return (
                                        <Form.Item
                                            name={[ field?.name, 'link' ]}
                                            fieldKey={[ field?.fieldKey, 'link' ]}
                                            rules={normalRuleValidator('请输入', true)}
                                        >
                                            <Input allowClear />
                                        </Form.Item>
                                    );
                                } else {
                                    return (
                                        <Form.Item
                                            name={[ field?.name, 'postTitle' ]}
                                            fieldKey={[ field?.fieldKey, 'postTitle' ]}
                                            rules={normalRuleValidator('请输入', true)}
                                        >
                                            {selectNode}
                                        </Form.Item>
                                    );
                                }
                            }}
                        </Form.Item>
                    );
                },
            },
            {
                title: '操作',
                key: 'ops_action',
                width: 60,
                render: (v, record, childIndex) => {
                    return (
                        <>
                            {equaledFields?.length > 1 ? (
                                <Button
                                    type="link"
                                    style={{ padding: 0 }}
                                    danger
                                    onClick={() => {
                                        handleEqualedRemove(childIndex);
                                    }}
                                >
                                    移除
                                </Button>
                            ) : null}
                        </>
                    );
                },
            },
        ];
        return (
            <>
                <SortableTable
                    helperClass="row-dragging-club__pedia"
                    onChangeSort={onChangeSort}
                    dataSource={equaledFields}
                    className={`club__pedia__form-list__children club__pedia__form-list__children_${partentIndex}`}
                    columns={columns}
                    pagination={false}
                    size="small"
                    locale={{
                        emptyText: '暂无数据',
                    }}
                    rowKey="key"
                    scroll={equaledFields.length > 3 ? { y: 150 } : {}}
                    footer={() => {
                        return equaledFields?.length < SECTION_CHILDREN_MAX ? (
                            <Button block onClick={handleAdd} icon={<PlusCircleOutlined />}>
                                添加内容项
                            </Button>
                        ) : null;
                    }}
                />
            </>
        );
    }, [
        ClubUploadOption,
        equaledFields,
        handleAdd,
        handleEqualedRemove,
        onChangeSort,
        partentIndex,
        pediaType,
        selectNode,
    ]);
}

interface SecetionItemProps {
    boardId: string | number;
    isCreate?: boolean;
    submitTime?: number;
    form: FormInstance;
    fields: FormListFieldData[];
    add: FormListOperation['add'];
    remove: FormListOperation['remove'];
    move: FormListOperation['move'];
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    pediaType: PEDIA_TYPE;
    /** form 字段绝对路径，默认 ['columns']；多语言场景传入对应语种的路径 */
    rootPath?: (string | number)[];
}
export function SecetionItem(props: SecetionItemProps) {
    const { boardId, form, isCreate, fields, submitTime, clubDeployVersion, pediaType, rootPath = [ 'columns' ] } = props;

    const equaledFields = useIsEqualState(fields, isEqual);
    const [ handleRemoveTime, setHandleRemoveTime ] = useState(Date.now());

    const [ removeBtnLoading, setRemoveBtnLoading ] = useSyncState(false);
    /** 展开的key */
    const [ expandedRowKeys, setExpandedRowKeys ] = useState<number[]>([]);
    /** 记录上一次提交的时间，方便提交再次全部展开本栏目 */
    const currentTime = useRef(0);
    /** 非展开的key,方便记录新增fields数据全部重新渲染 */
    const excludeKeys = useRef<number[]>([]);
    useEffect(() => {
        if (submitTime !== currentTime.current) {
            setExpandedRowKeys(equaledFields?.map(x => x.key));
            excludeKeys.current = [];
        } else {
            setExpandedRowKeys(equaledFields?.filter(x => !excludeKeys.current.includes(x.key)).map(x => x.key) || []);
        }
        currentTime.current = submitTime || 0;
    }, [ equaledFields, submitTime ]);

    const handleAdd = useCallback(async () => {
        const sections = form.getFieldValue(rootPath) || [];
        form.setFields([ { name: rootPath, value: [ ...sections, { ...DefaultSections, sort: sections.length } ] } ]);
        setHandleRemoveTime(Date.now());
    }, [ form, rootPath ]);

    const removeSection = useCallback(
        index => {
            const sections = form.getFieldValue(rootPath);
            form.setFields([ { name: rootPath, value: sections.filter((x: any, xi: number) => xi !== index) } ]);
            setHandleRemoveTime(Date.now());
        },
        [ form, rootPath ]
    );

    const handleRemove = useCallback(
        async index => {
            if (removeBtnLoading) {
                return;
            }
            try {
                let clubDeployVersion = form.getFieldValue('clubDeployVersion');
                let { id = '', children } = form.getFieldValue([ ...rootPath, index ]);
                let ids: any[] = [ id ];
                children?.forEach((x: BoardSectionType) => {
                    ids.push(x?.id);
                });
                ids = ids.filter(Boolean);
                if (ids.length) {
                    setRemoveBtnLoading(true);
                    const { data = false } = await getBoardSection(
                        {
                            ids: ids.join(','),
                        },
                        clubDeployVersion
                    );
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
        [ form, removeBtnLoading, removeSection, rootPath, setRemoveBtnLoading ]
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
            let type: MOMENT_TYPE = form.getFieldValue([ ...rootPath, record.key, 'type' ]) || 0;
            return [ MOMENT_TYPE.Post, MOMENT_TYPE.Feeling ].includes(type);
        },
        [ form, rootPath ]
    );

    const onChangeSort = useCallback(
        ({ oldIndex, newIndex }) => {
            const sections = form.getFieldValue(rootPath);
            form.setFields([ { name: rootPath, value: arrayMove(sections, oldIndex, newIndex) } ]);
            setHandleRemoveTime(Date.now());
        },
        [ form, rootPath ]
    );

    const expandedRowRender = useCallback(
        (record: FormListFieldData) => {
            let type: MOMENT_TYPE = form.getFieldValue([ ...rootPath, record.key, 'type' ]) || 0;
            let isRender = [ MOMENT_TYPE.Post, MOMENT_TYPE.Feeling ].includes(type);
            let name = [ record.key, 'children' ];

            return (
                <div style={{ display: isRender ? 'block' : 'none' }}>
                    <Form.List name={name}>
                        {(fieldsData, { add, remove, move }) => {
                            return (
                                <SectionsChildren
                                    boardId={boardId}
                                    isCreate={isCreate}
                                    index={record.key || 0}
                                    fields={fieldsData}
                                    form={form}
                                    add={add}
                                    remove={remove}
                                    move={move}
                                    clubDeployVersion={clubDeployVersion}
                                    pediaType={pediaType}
                                    rootPath={[ ...rootPath, record.key, 'children' ]}
                                />
                            );
                        }}
                    </Form.List>
                </div>
            );
        },
        [ boardId, clubDeployVersion, form, isCreate, pediaType, rootPath ]
    );

    return useMemo(() => {
        // 校验名字重复
        const nameRepeatValidate = (name: string, index: number, required: boolean) => {
            return [
                {
                    validator: (_rule: Rule, value: string) => {
                        if (!value && required) {
                            return Promise.reject('请输入');
                        }
                        return Promise.resolve();
                        // else {
                        //     names.splice(index, 1);
                        //     if (names.findIndex(item => item === value) !== -1) {
                        //         return Promise.reject('名字不能重复');
                        //     } else {
                        //         return Promise.resolve();
                        //     }
                        // }
                    },
                },
            ];
        };
        const columns: ColumnsType<FormListFieldData> = [
            {
                key: 'section',
                title: '序号',
                align: 'center',
                render: (v, record, index) => {
                    return (
                        <>
                            {record.name + 1}
                            {!isCreate && (
                                <Form.Item
                                    hidden
                                    {...record}
                                    name={[ record.name, 'id' ]}
                                    fieldKey={[ record.fieldKey, 'id' ]}
                                >
                                    <FormOnlyVisiable />
                                </Form.Item>
                            )}
                        </>
                    );
                },
            },
            {
                key: 'name',
                title: '栏目名称',
                align: 'center',
                render: (v, record, index) => {
                    return (
                        <Form.Item
                            {...record}
                            name={[ record.name, 'name' ]}
                            fieldKey={[ record.fieldKey, 'name' ]}
                            rules={nameRepeatValidate('columns', index, true)}
                            normalize={val => val?.trim()}
                            dependencies={[ [ record.name + 1, 'name' ] ]}
                        >
                            <Input maxLength={SECTION_TITLE_LENGTH_MAX} allowClear />
                        </Form.Item>
                    );
                },
            },
            {
                key: 'enable',
                title: '是否启用',
                align: 'center',
                width: 88,
                render: (v, record, index) => {
                    return (
                        <>
                            <Form.Item
                                noStyle
                                {...record}
                                name={[ record.name, 'enable' ]}
                                fieldKey={[ record.fieldKey, 'enable' ]}
                                key={record.key + 'enable'}
                                rules={normalRuleValidator()}
                            >
                                <NumberSwitch checkedChildren="开启" unCheckedChildren="关闭" />
                            </Form.Item>
                        </>
                    );
                },
            },
            {
                key: 'ops_action',
                title: '操作',
                align: 'center',
                width: 61,
                render: (field, record, index) => {
                    return (
                        <>
                            {equaledFields?.length > 1 ? (
                                <Button
                                    danger
                                    type="link"
                                    loading={removeBtnLoading}
                                    onClick={() => handleRemove(index)}
                                >
                                    移除
                                </Button>
                            ) : null}
                        </>
                    );
                },
            },
        ];

        return (
            <div className="club-pedia-sections">
                <SortableTable
                    key={handleRemoveTime}
                    helperClass="row-dragging-club__pedia"
                    className="form-list"
                    dataSource={equaledFields}
                    expandable={{
                        expandedRowKeys: expandedRowKeys,
                        childrenColumnName: 'childrenColumnName', // 这里特意设置成不存在的key
                        defaultExpandAllRows: true,
                        expandedRowRender,
                        onExpand,
                        rowExpandable,
                    }}
                    onChangeSort={onChangeSort}
                    columns={columns}
                    pagination={false}
                    size="small"
                    rowKey="key"
                    footer={() => {
                        return equaledFields?.length < SECTION_LENGTH_MAX ? (
                            <Button block onClick={handleAdd} icon={<PlusCircleOutlined />}>
                                添加栏目
                            </Button>
                        ) : null;
                    }}
                />
            </div>
        );
    }, [
        handleRemoveTime,
        equaledFields,
        expandedRowKeys,
        expandedRowRender,
        onExpand,
        rowExpandable,
        onChangeSort,
        isCreate,
        removeBtnLoading,
        handleRemove,
        handleAdd,
    ]);
}

export default SecetionItem;
