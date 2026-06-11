import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { inject, observer } from 'mobx-react';
import { Image, Select, Button, message, Modal, Input } from 'antd';
import { FilterBox, Q1Table, ColumnsType, Q1TablePropsType } from 'q1-antd';
import { cloneDeep, get, keyBy } from 'lodash';
import type { TableRowSelection } from 'antd/es/table/interface';
import { arrayMoveImmutable as arrayMove } from 'array-move';

import Permissions from '@/layouts/components/permissions';
import { StoreType } from '@/store/config';
import { useTableAdaptHeight } from '@/utils/tableAdapt';
import { removeEmoticon, sortEmoticon, getEmoticonList } from '@/api/club';
import { useContentDialogContainer, useContentPermissionFn } from '@/context';
import { simpleTime } from '@/utils/date';
import ActionGroup from '@/components/ActionGroup';
import SortableTable from '@/components/q1Table/sortableTable';
import { usePersistantFunction } from '@/hooks/state/useLatestValueRef';
import { usePremitClubBoard } from '@/pages/club/board/hooks/useClubBoardOptions';
import ImagePreviewGroup from '@/components/display/ImagePreviewGroup/ImagePreviewGroup';

import { FeedbackResponseType2 } from '@ts/api';
import { OMIT_TABLE_HEIGHT } from '@ts/clientModel';
import { paginationType } from '@ts/common';
import {
    EmoticonItem,
    SECTION_ENUM,
    SectionConstant,
    BOARD_STATUS,
    BOARD_PERMIT_SEPARATE,
    EMOTICON_STATUS,
    EmoticonRecordOptions,
    EmoticonsStatusColor,
    EmoticonStatusConstants,
} from '@ts/club';

import { TABLE_TYPE } from '../index';
import Create from './Create';
import Audit from './Audit';

import './tableList.less';
/** 位置-默认值 */
export const sectionIdDefault = [ { label: SectionConstant[SECTION_ENUM.Recommend], value: SECTION_ENUM.Recommend } ];
const defaultPagination: paginationType = {
    pageIndex: 1,
    pageSize: 10,
};

interface TableListProps {
    tableType: TABLE_TYPE;
    activeTime?: number;
}
interface MobxTableListProps
    extends TableListProps,
        Pick<StoreType, 'UIState' | 'Permit' | 'Game' | 'GameContext' | 'User'> {}

const TableList: React.FC<TableListProps> = function TableList(props: TableListProps) {
    const { tableType, UIState, activeTime } = props as MobxTableListProps;

    const { hasFunctionPermit } = useContentPermissionFn();

    const { clubBoardOptions, boardDictForPermit } = usePremitClubBoard();
    const [ clubDeployVersion, setclubDeployVersion ] = useState(get(clubBoardOptions, '0.value'));
    const [ loading, setLoading ] = useState(false);
    const [ currentPagination, setCurrentPagination ] = useState(defaultPagination); // 分页
    const tableEl = useRef<HTMLDivElement>(null);
    const getTableHeight = useTableAdaptHeight(tableEl, OMIT_TABLE_HEIGHT);
    const [ tableData, setTableData ] = useState<FeedbackResponseType2<EmoticonItem[]>>(
        {} as FeedbackResponseType2<EmoticonItem[]>
    );
    const previousBoradId = useRef<string>(); // 记录上一次的BoradId

    // 编辑
    const [ editVisiable, setEditVisiable ] = useState(false);
    const [ editData, setEditData ] = useState<EmoticonItem | undefined>();

    // 多选配置
    const [ selectedRow, setselectedRow ] = useState<EmoticonItem[]>([]);
    const [ auditVisiable, setAuditVisiable ] = useState(false);
    // form 表单查询
    const filterers = FilterBox.useFilterBox();
    const filterInit = {
        boardId: get(clubBoardOptions, '0.children.0.value'),
        sectionId: undefined,
        status: undefined,
        name: '',
    };

    const [ currentFromFilter, setCurrentFromFilter ] = useState(filterInit); // 记录上一次的查询条件，为使用是否拖动使用
    const [ initialValues, setInitialValues ] = useState(filterInit);

    // 获取table数据
    const { fetchTableData } = usePersistantFunction({
        fetchTableData: async () => {
            try {
                setLoading(true);
                const { status, boardId, name, ...values } = await filterers.validate();
                setCurrentFromFilter({ status, boardId, ...values } as any);
                if ([ null, undefined ].includes(boardId)) {
                    message.warning('请选择所属版块');
                    return false;
                }
                let query: any = {
                    ...values,
                    ...(name === undefined ? {} : { name }),
                    boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1],
                    status: status ? status : tableType === TABLE_TYPE.Audit ? EMOTICON_STATUS.Pendding : undefined,
                    ...currentPagination,
                };
                let res: any = await getEmoticonList(query, clubDeployVersion);
                let { data, total } = res;
                setTableData({ data, total });
                setselectedRow([]);
            } catch (e) {
                console.log(e);
            } finally {
                setLoading(false);
            }
        },
    });
    // 请求table数据
    useEffect(() => {
        fetchTableData();
    }, [ currentPagination.pageIndex, currentPagination.pageSize, fetchTableData ]);

    useEffect(() => {
        let boardId = get(clubBoardOptions, '0.children.0.value');
        if (boardId) {
            fetchTableData();
            previousBoradId.current = boardId;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ activeTime ]);

    const handleFormChange = useCallback(
        async val => {
            let { boardId, sectionId, ...ret } = await filterers.validate();
            if (previousBoradId.current !== boardId) {
                setclubDeployVersion(boardId.split(BOARD_PERMIT_SEPARATE)[0]);
                fetchTableData();
            }
            setInitialValues({
                boardId,
                sectionId: undefined,
                ...ret,
            } as any);
            previousBoradId.current = boardId;
        },
        [ fetchTableData, filterers ]
    );
    // 查询
    function fetchTableDataByFilter() {
        setCurrentPagination(prev => {
            if (prev.pageIndex === currentPagination.pageIndex && prev.pageSize === currentPagination.pageSize) {
                fetchTableData();
            }
            return {
                pageIndex: 1,
                pageSize: prev.pageSize,
            };
        });
    }

    // 分页
    function handleChange(nextPagination: any, filters: any, sorter: any) {
        setCurrentPagination({
            pageIndex: nextPagination.current,
            pageSize: nextPagination.pageSize || defaultPagination.pageSize,
        });
    }

    const getContainer = useContentDialogContainer();

    const handleAdd = useCallback(async () => {
        const { boardId } = await filterers.validate();
        if (boardDictForPermit[boardId]?.status === BOARD_STATUS.Close) {
            message.warning('该版块已停用，不可新增表情包');
            return;
        }
        setEditVisiable(true);
        setEditData({ boardId } as any);
    }, [ boardDictForPermit, filterers ]);

    const handleAddOk = useCallback(
        async data => {
            if (!editData?.id) {
                UIState.gotoTab({
                    pathname: `/game/club/emoticons/list`,
                    search: `?tableType=Audit&boardId=${data?.boardId}`,
                });
            }
            fetchTableData();
            setEditVisiable(false);
        },
        [ UIState, editData, fetchTableData ]
    );

    const handleAudit = () => {
        setAuditVisiable(true);
    };

    const handleSort = useCallback(
        ({ oldIndex, newIndex }) => {
            let oldTableData = cloneDeep(tableData);
            let result = cloneDeep(tableData);
            let data: EmoticonItem[] = arrayMove(get(tableData, 'data', []), oldIndex, newIndex);
            // 排序后重新设置 sort 值
            data = data.map((x, xi) => ({ ...x, sort: xi * currentPagination.pageIndex }));
            result.data = data;
            setTableData(result);
            Modal.confirm({
                getContainer,
                title: '系统提示',
                content: (
                    <div>
                        <p className="recycleBin__delete__text">
                            <span>确定更新排序？</span>
                        </p>
                    </div>
                ),
                onOk: async () => {
                    try {
                        setLoading(true);
                        let oldTableDataDict = keyBy(oldTableData.data, 'id');
                        data = data.filter(x => x.sort !== oldTableDataDict[x.id]?.sort);
                        const res = await sortEmoticon({ boardId: get(data, '0.boardId') }, data, clubDeployVersion);
                        if (res.code === 0) {
                            message.success('更新排序成功');
                        } else {
                            message.error(res.message || '操作异常');
                        }
                        fetchTableData();
                    } finally {
                        setLoading(false);
                    }
                },
                onCancel: () => {
                    setTableData(oldTableData);
                },
            });
        },
        [ currentPagination.pageIndex, clubDeployVersion, fetchTableData, getContainer, tableData ]
    );

    const handleEdit = (record: EmoticonItem) => {
        setEditVisiable(true);
        setEditData({ ...record, boardId: (previousBoradId.current as unknown) as any });
    };
    const handleDelete = useCallback(
        (record: EmoticonItem) => {
            Modal.confirm({
                getContainer,
                title: '系统提示',
                content: (
                    <div>
                        <p className="recycleBin__delete__text">
                            <span>确定删除表情包</span>【<span>{record.name}</span>】<span>吗</span>？
                        </p>
                    </div>
                ),
                onOk: async () => {
                    const { boardId } = await filterers.validate();
                    const res = await removeEmoticon(
                        { id: record?.id, boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1] },
                        clubDeployVersion
                    );
                    if (res.code === 0) {
                        fetchTableData();
                        message.success('删除成功');
                    } else {
                        message.error(res?.msg || '删除异常错误');
                    }
                },
                onCancel: () => {},
            });
        },
        [ clubDeployVersion, fetchTableData, filterers, getContainer ]
    );

    const rowSelection: TableRowSelection<EmoticonItem> | undefined = useMemo(() => {
        return tableType === TABLE_TYPE.Record
            ? undefined
            : {
                  type: 'checkbox',
                  selectedRowKeys: selectedRow.map(x => x.id),
                  columnWidth: 50,
                  onChange: (key: React.Key[], selectedRow: EmoticonItem[]) => {
                      setselectedRow(selectedRow);
                  },
              };
    }, [ selectedRow, tableType ]);

    const tableTools = useMemo(() => {
        return tableType === TABLE_TYPE.Record ? (
            <>
                <Permissions value="btn__add__club_emoticons">
                    <Button type="primary" onClick={handleAdd}>
                        新增
                    </Button>
                </Permissions>
            </>
        ) : (
            <>
                <Permissions value="btn__add__club_emoticons">
                    <Button type="primary" onClick={handleAdd}>
                        新增
                    </Button>
                </Permissions>
                <Permissions value="btn__update__club_emoticons_audit">
                    <Button type="primary" onClick={handleAudit} disabled={!selectedRow.length}>
                        批量审核
                    </Button>
                </Permissions>
            </>
        );
    }, [ handleAdd, selectedRow.length, tableType ]);

    // 表格数据
    const tableProps: Q1TablePropsType<EmoticonItem> = useMemo(() => {
        const columns: ColumnsType<EmoticonItem> = [
            {
                title: '表情包名称',
                dataIndex: 'name',
                align: 'left',
                width: 120,
                ellipsis: true,
            },
            {
                title: '表情包ICON',
                dataIndex: 'icon',
                width: 120,
                render: (v: string) => {
                    return <Image src={v} className="emoticons-list__table__record__image"></Image>;
                },
            },

            {
                title: '表情包栏目',
                dataIndex: 'list',
                render: v => {
                    const list = v && JSON.parse(v);
                    return <ImagePreviewGroup showCount={6} data={list || []} />;
                },
            },
            {
                title: '状态',
                dataIndex: 'status',
                width: 80,
                render: (v: EMOTICON_STATUS) => (
                    <span style={{ color: EmoticonsStatusColor[v] }}>{EmoticonStatusConstants[v]}</span>
                ),
            },
            ...((tableType === TABLE_TYPE.Record
                ? [
                      {
                          title: '审核人',
                          dataIndex: 'auditedBy',
                          width: 80,
                          align: 'left',
                      },
                      {
                          title: '审核时间',
                          dataIndex: 'auditedTime',
                          width: 160,
                          render: (v: string) => simpleTime(v),
                      },
                  ]
                : []) as ColumnsType<EmoticonItem>),
            {
                title: '申请人',
                dataIndex: 'updateBy',
                width: 80,
                align: 'left',
            },
            {
                title: '申请时间',
                dataIndex: 'updateTime',
                width: 160,
                render: (v: string) => (v ? simpleTime(v) : ''),
            },
            {
                title: '操作',
                dataIndex: 'operation',
                width: 88,
                resizable: false,
                fixed: 'right',
                render: (v: any, record: EmoticonItem) => {
                    return (
                        <ActionGroup
                            className="operation-btn-group"
                            btns={[
                                {
                                    title: '',
                                    icon: '',
                                    hidden: !hasFunctionPermit('btn__update__club_emoticons'),
                                    props: {
                                        type: 'link',
                                        children: '编辑',
                                        onClick: () => handleEdit(record),
                                    },
                                },
                                {
                                    title: '',
                                    icon: '',
                                    hidden: !hasFunctionPermit('btn__del__club_emoticons'),
                                    props: {
                                        type: 'link',
                                        children: '删除',
                                        onClick: () => handleDelete(record),
                                    },
                                },
                            ]}
                        ></ActionGroup>
                    );
                },
            },
        ];

        return {
            columns: columns,
            dataSource: tableData.data,
            rowKey: 'id',
            tableName: `operation@page__list__club_emoticons@${tableType}`,
            loading,
            tableTools,
            scrollToFirstRowOnChange: true,
            pagination: {
                showSizeChanger: true,
                current: currentPagination.pageIndex,
                pageSize: currentPagination.pageSize,
                total: tableData.total,
                showQuickJumper: true,
                showTotal: () => `共${tableData.total}条`,
            },
            onChange: handleChange,
            rowSelection: rowSelection,
        };
    }, [
        tableType,
        tableData.data,
        tableData.total,
        loading,
        tableTools,
        currentPagination.pageIndex,
        currentPagination.pageSize,
        rowSelection,
        hasFunctionPermit,
        handleDelete,
    ]);

    const sortableDisabled = useMemo(() => {
        const { status, name } = currentFromFilter;
        let falsityArr = [ undefined, '', null ];
        return !(falsityArr.includes(status) && falsityArr.includes(name));
    }, [ currentFromFilter ]);

    return (
        <div className="emoticons-list">
            <FilterBox
                context={filterers}
                query={fetchTableDataByFilter}
                tableName="clubEmotionsList"
                showAdvancedFilter={false}
                initialValues={initialValues}
                key={JSON.stringify(initialValues)}
            >
                <FilterBox.Item name="boardId" label="所属版块" rules={[ { message: '请选择', required: true } ]}>
                    <Select onChange={handleFormChange}>
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
                </FilterBox.Item>

                {tableType === TABLE_TYPE.Record ? (
                    <FilterBox.Item name="status" label="状态" hidden={tableType !== TABLE_TYPE.Record}>
                        <Select
                            options={EmoticonRecordOptions}
                            onChange={handleFormChange}
                            placeholder="不限"
                            allowClear
                        ></Select>
                    </FilterBox.Item>
                ) : (
                    ''
                )}

                <FilterBox.Item name="name" label="表情包名称">
                    <Input placeholder="名称" maxLength={128} onChange={handleFormChange} />
                </FilterBox.Item>
            </FilterBox>

            {tableType === TABLE_TYPE.Record ? (
                <div className="card-container">
                    <div className="record-table">{tableTools}</div>
                    <SortableTable
                        onChangeSort={handleSort}
                        {...tableProps}
                        helperClass="row-dragging-emoticons"
                        sortableDisabled={sortableDisabled}
                    />
                </div>
            ) : (
                <div ref={tableEl}>
                    <Q1Table {...tableProps} scroll={{ y: getTableHeight }} />
                </div>
            )}

            <Create
                clubBoardOptions={clubBoardOptions}
                visible={editVisiable}
                data={editData}
                clubDeployVersion={clubDeployVersion}
                onCancel={() => {
                    setEditVisiable(false);
                }}
                onOk={handleAddOk}
            />
            <Audit
                visible={auditVisiable}
                data={selectedRow}
                clubDeployVersion={clubDeployVersion}
                onCancel={() => {
                    setAuditVisiable(false);
                }}
                onOk={() => {
                    setAuditVisiable(false);
                    fetchTableData();
                }}
            />
        </div>
    );
};

export default inject('UIState', 'Permit', 'GameContext', 'User', 'Club')(observer(TableList));
