import React, { useState, useCallback, useEffect, useRef, useMemo, useImperativeHandle, forwardRef } from 'react';
import { Button, Input, message, Modal, Select, Spin, Switch, Tabs } from 'antd';
import { inject, observer, useObserver } from 'mobx-react';
import { ColumnsType, FilterBox, Q1Table, Q1TablePropsType } from 'q1-antd';
import { cloneDeep, get, keyBy } from 'lodash';
import type { TableRowSelection } from 'antd/es/table/interface';
import moment from 'moment';
import { arrayMove } from 'react-sortable-hoc';

import {
    useContentDialogContainer,
    useContentPermissionFn,
    useContentTabSearch,
    useReactive,
    useStore,
} from '@/context';
import {
    deleteCreatorTask,
    getCreatorAuditTaskList,
    getCreatorTaskDetail,
    getCreatorTaskList,
    sortCreatorTask,
    toggleCreatorTaskEnable,
} from '@/api/club';
import { simpleTime } from '@/utils/date';
import ActionGroup from '@/components/ActionGroup';
import { useTableAdaptHeight } from '@/utils/tableAdapt';
import SortableTable from '@/components/q1Table/sortableTable';
import { usePersistantFunction } from '@/hooks/state/useLatestValueRef';

import { DefaultPagination } from '@ts/enum/table';
import { BOARD_PERMIT_SEPARATE } from '@ts/club';
import {
    CreateEditDataType,
    CreatorTaskFilterTypeOptions,
    CreatorTaskStatusFilterTypeOptions,
    CreatorTaskType,
    TASK_STATUS_ENUM,
    TaskStatusColorConstant,
    TaskStatusConstant,
} from '@ts/creator';
import { FeedbackResponseType2 } from '@ts/api';
import { OMIT_TABLE_HEIGHT } from '@ts/clientModel';

import { usePremitClubBoard } from '../board/hooks/useClubBoardOptions';
import Audit from './components/Audit';
import Create from './components/Create';
require('./index.less');
const pickFilterItemCom = (type: string) => (
    <FilterBox.Item
        name={type}
        noStyle
        rules={
            [ 'userId', 'userInfoId' ].includes(type)
                ? [
                      {
                          pattern: new RegExp(/^(0|[1-9][0-9]*|-[1-9][0-9]*)$/),
                          message: '请输入整数',
                      },
                  ]
                : undefined
        }
    >
        <Input placeholder="请输入" style={{ width: 250 }} allowClear />
    </FilterBox.Item>
);

export enum TABLE_TYPE {
    Record = 'Record',
    Audit = 'Audit',
}
export const TableTypeValues = [ TABLE_TYPE.Record, TABLE_TYPE.Audit ] as const;

function CreatorListFn() {
    // 初始tabPane
    const [ activeKey, setActiveKey ] = useState<TABLE_TYPE>(TABLE_TYPE.Record);
    const recordRef = useRef<{ fetchTableData(): Promise<void> }>();
    const auditRef = useRef<{ fetchTableData(): Promise<void> }>();
    const urlTableType = (useContentTabSearch().get('tableType') || '') as TABLE_TYPE;

    useEffect(() => {
        TableTypeValues.includes(urlTableType) && setActiveKey(urlTableType);
    }, [ urlTableType ]);

    useReactive(() => {
        TableTypeValues.includes(urlTableType) && setActiveKey(urlTableType);
    });
    const handleTabClick = useCallback((key: string) => {
        setActiveKey((key as unknown) as TABLE_TYPE);
    }, []);
    const handleTabChange = useCallback((key: string) => {
        setActiveKey((key as unknown) as TABLE_TYPE);
        key === TABLE_TYPE.Record ? recordRef.current?.fetchTableData() : auditRef.current?.fetchTableData();
    }, []);

    return (
        <>
            <Tabs activeKey={activeKey} className="page-content-tabbox" onTabClick={handleTabClick} animated={false}>
                <Tabs.TabPane tab="任务列表" key={TABLE_TYPE.Record}>
                    <TableList tableType={TABLE_TYPE.Record} onTabChange={handleTabChange} ref={recordRef} />
                </Tabs.TabPane>
                <Tabs.TabPane tab="审核列表" key={TABLE_TYPE.Audit}>
                    <TableList tableType={TABLE_TYPE.Audit} onTabChange={handleTabChange} ref={auditRef} />
                </Tabs.TabPane>
            </Tabs>
        </>
    );
}

const CreatorListBase = inject('UIState')(observer(CreatorListFn));

export default function RecycleListAll() {
    const { Club } = useStore();
    const isLoaded = useObserver(() => Club.isLoaded);
    return isLoaded ? (
        <CreatorListBase />
    ) : (
        <Spin size="large">
            <div style={{ height: '100vh' }}></div>
        </Spin>
    );
}

interface TableListProps {
    tableType: TABLE_TYPE;
    onTabChange(key: TABLE_TYPE): void;
}
const TableList = forwardRef(({ tableType, onTabChange }: TableListProps, ref) => {
    const { clubBoardOptions } = usePremitClubBoard();
    const filterInit = {
        boardId: get(clubBoardOptions, '0.children.0.value'),
        filterType: 'id',
    };
    const previousBoardId = useRef<string>();
    const [ initialValues, setInitialValues ] = useState(filterInit);
    const [ currentPagination, setCurrentPagination ] = useState(DefaultPagination);
    const [ selectedRow, setSelectedRow ] = useState<CreatorTaskType[]>([]);
    const [ auditVisible, setAuditVisible ] = useState(false);
    const [ clubDeployVersion, setclubDeployVersion ] = useState(get(clubBoardOptions, '0.value'));
    const tableEl = useRef<HTMLDivElement>(null);
    const getTableHeight = useTableAdaptHeight(tableEl, OMIT_TABLE_HEIGHT);
    const [ tableData, setTableData ] = useState<FeedbackResponseType2<CreatorTaskType[]>>(
        {} as FeedbackResponseType2<CreatorTaskType[]>
    );
    const getContainer = useContentDialogContainer();
    const [ loading, setLoading ] = useState(false);
    const [ editVisible, setEditVisible ] = useState(false);
    const [ editData, setEditData ] = useState<CreateEditDataType>({} as CreateEditDataType);
    const filterers = FilterBox.useFilterBox();
    const { hasFunctionPermit } = useContentPermissionFn();
    const {
        UIState,
        User: { name: userName },
    } = useStore();
    const { fetchTableData } = usePersistantFunction({
        async fetchTableData() {
            try {
                setLoading(true);
                const { type, boardId, filterType, ...values } = await filterers.validate();
                if ([ null, undefined ].includes(boardId)) {
                    message.warn('请选择所属版块');
                    return false;
                }
                const query: any = {
                    boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1],
                    ...values,
                    ...currentPagination,
                };
                const { data, total }: any =
                    tableType === TABLE_TYPE.Record
                        ? await getCreatorTaskList(query, clubDeployVersion)
                        : await getCreatorAuditTaskList(query, clubDeployVersion);
                if (data == null) {
                    setTableData({ data: [], total: 0 });
                } else {
                    setTableData({
                        data: data.map((v: any) => ({ ...v, boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1] })),
                        total,
                    });
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        },
    });
    useImperativeHandle(ref, () => ({ fetchTableData }));
    useEffect(() => {
        fetchTableData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ currentPagination.pageIndex, currentPagination.pageSize ]);

    useEffect(() => {
        let boardId = get(clubBoardOptions, '0.children.0.value');
        if (boardId) {
            fetchTableData();
            previousBoardId.current = boardId;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const handleFormChange = useCallback(
        async val => {
            let { boardId, ...ret } = await filterers.validate();
            if (previousBoardId.current !== boardId) {
                setclubDeployVersion(boardId.split(BOARD_PERMIT_SEPARATE)[0]);
                fetchTableData();
            }
            setInitialValues({
                boardId,
                ...ret,
            } as any);
            previousBoardId.current = boardId;
        },
        [ fetchTableData, filterers ]
    );
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
    const handleAdd = useCallback(async () => {
        const { boardId } = await filterers.validate();
        const origin = boardId.split('&&')[0];
        const id = boardId.split('&&')[1];
        setEditData({
            boardId,
            boardName: clubBoardOptions.find(v => v.value === origin)?.children.find(v => v.id.toString() === id)
                ?.label,
        } as any);
        setEditVisible(true);
    }, [ clubBoardOptions, filterers ]);

    const tableTools = useMemo(() => {
        return tableType === TABLE_TYPE.Record ? (
            <Button type="primary" onClick={handleAdd}>
                新增
            </Button>
        ) : (
            <Button
                type="primary"
                onClick={() => {
                    setAuditVisible(true);
                }}
                disabled={!selectedRow.length}
            >
                批量审核
            </Button>
        );
    }, [ handleAdd, selectedRow.length, tableType ]);

    const handleAddOk = useCallback(
        async data => {
            if (tableType === TABLE_TYPE.Record) {
                UIState.gotoTab({
                    pathname: `/game/club/creator/task`,
                    search: `?searchType=Audit`,
                });
            }
            onTabChange(TABLE_TYPE.Audit);
            setEditVisible(false);
        },
        [ UIState, onTabChange, tableType ]
    );
    const handleDelete = useCallback(
        (record: CreatorTaskType) => {
            Modal.confirm({
                getContainer,
                content: (
                    <div>
                        <p>
                            <span>确定要删除当前创作任务吗？</span>
                        </p>
                    </div>
                ),
                onOk: async () => {
                    const { boardId } = await filterers.validate();
                    const res = await deleteCreatorTask(
                        { boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1], id: record?.id },
                        clubDeployVersion
                    );
                    if (res.code === 0) {
                        fetchTableData();
                        message.success('删除成功');
                    } else {
                        message.error(res.msg || '删除异常错误');
                    }
                },
                onCancel: () => {},
            });
        },
        [ clubDeployVersion, fetchTableData, filterers, getContainer ]
    );

    const rowSelection: TableRowSelection<CreatorTaskType> | undefined = useMemo(() => {
        return tableType === TABLE_TYPE.Record
            ? undefined
            : {
                  type: 'checkbox',
                  selectedRowKeys: selectedRow.map(x => x.id),
                  columnWidth: 50,
                  onChange: (key: React.Key[], selectedRow: CreatorTaskType[]) => {
                      setSelectedRow(selectedRow);
                  },
                  getCheckboxProps: (record: any) => ({
                      disabled: record.status === TASK_STATUS_ENUM.Finish,
                  }),
              };
    }, [ selectedRow, tableType ]);

    function handleChange(nextPagination: any, filters: any, sorter: any) {
        setCurrentPagination({
            pageIndex: nextPagination.current,
            pageSize: nextPagination.pageSize || DefaultPagination.pageSize,
        });
    }
    const handleSwitch = useCallback(
        (record: CreatorTaskType, v: any) => {
            Modal.confirm({
                getContainer,
                title: '系统提示',
                content: (
                    <div>
                        <p>
                            <span>确定</span>
                            <span>{v ? '启用' : '停用'}</span>【<span>{record.name}</span>】？
                        </p>
                    </div>
                ),
                onOk: async () => {
                    const { boardId } = await filterers.validate();
                    const res = await toggleCreatorTaskEnable(
                        {
                            boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1],
                            id: record.id,
                            isEnable: v ? 1 : 0,
                        },
                        clubDeployVersion
                    );
                    if (res.code === 0) {
                        fetchTableData();
                        message.success('操作成功');
                    } else {
                        message.error(res.message || '操作异常');
                    }
                },
                onCancel: () => {},
            });
        },
        [ clubDeployVersion, fetchTableData, filterers, getContainer ]
    );
    const handleCopy = useCallback(
        async (record: CreatorTaskType) => {
            const { boardId } = await filterers.validate();
            const origin = boardId.split('&&')[0];
            const id = boardId.split('&&')[1];
            const { data, msg } = await getCreatorTaskDetail({ boardId: id, id: record.id }, clubDeployVersion);
            if (!data) {
                return message.error(msg);
            }
            const { name, beginTime, endTime } = record;
            const users = data?.taskItems
                .find(v => v.users)
                ?.users.map(k => ({ value: k.userInfoId, label: `${k.nickName}(${k.userInfoId})` }));
            setEditData({
                boardId,
                name,
                boardName: clubBoardOptions.find(v => v.value === origin)?.children.find(v => v.id.toString() === id)
                    ?.label,
                beginTime: moment(beginTime * 1000),
                endTime: moment(endTime * 1000),
                ...(users ? { users } : {}),
                taskItems:
                    data?.taskItems.map(v => ({
                        ...v,
                        ...(v.users?.length ? { userInfoIds: v.users.map(k => k.userInfoId) } : {}),
                    })) ?? [],
            } as any);
            setEditVisible(true);
        },
        [ clubBoardOptions, clubDeployVersion, filterers ]
    );
    const handleEdit = useCallback(
        async (record: CreatorTaskType) => {
            const { boardId } = await filterers.validate();
            const origin = boardId.split('&&')[0];
            const id = boardId.split('&&')[1];
            const { data, msg } = await getCreatorTaskDetail({ boardId: id, id: record.id }, clubDeployVersion);
            if (!data) {
                return message.error(msg);
            }
            const { id: recordId, name, beginTime, endTime } = record;
            const users = data?.taskItems
                .find(v => v.users)
                ?.users.map(k => ({ value: k.userInfoId, label: `${k.nickName}(${k.userInfoId})` }));
            setEditData({
                id: recordId,
                boardId,
                name,
                ...(users ? { users } : {}),
                boardName: clubBoardOptions.find(v => v.value === origin)?.children.find(v => v.id.toString() === id)
                    ?.label,
                beginTime: moment(beginTime * 1000),
                endTime: moment(endTime * 1000),
                taskItems:
                    data?.taskItems.map(v => ({
                        ...v,
                        ...(v.users?.length ? { userInfoIds: v.users.map(k => k.userInfoId) } : {}),
                    })) ?? [],
            } as any);
            setEditVisible(true);
        },
        [ clubBoardOptions, clubDeployVersion, filterers ]
    );
    const handleSort = useCallback(
        ({ oldIndex, newIndex }) => {
            let oldTableData = cloneDeep(tableData);
            let result = cloneDeep(tableData);
            let data: CreatorTaskType[] = arrayMove(get(tableData, 'data', []), oldIndex, newIndex);
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
                        let _data = data.map(item => ({
                            id: item.id,
                            sort: item.sort,
                        }));
                        const res = await sortCreatorTask(
                            { boardId: get(data, '0.boardId') },
                            _data,
                            clubDeployVersion
                        );
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

    const tableProps: Q1TablePropsType<CreatorTaskType> = useMemo(() => {
        const columns: ColumnsType<CreatorTaskType> = [
            {
                title: '任务ID',
                dataIndex: 'id',
                width: 120,
            },
            ...(tableType === TABLE_TYPE.Record
                ? [
                      {
                          title: '启用状态',
                          dataIndex: 'isEnable',
                          width: 80,
                          render(v: boolean, record: CreatorTaskType) {
                              return (
                                  <Switch
                                      checked={v}
                                      checkedChildren="ON"
                                      unCheckedChildren="OFF"
                                      onChange={(e: any) => {
                                          handleSwitch(record, e);
                                      }}
                                  />
                              );
                          },
                      },
                  ]
                : []),
            {
                title: '任务名称',
                dataIndex: 'name',
                width: 160,
            },
            {
                title: '任务详情',
                dataIndex: 'description',
                width: 250,
                render(v: string[]) {
                    return v.map((k, i) => <div key={i}>{k}</div>);
                },
            },

            {
                title: '状态',
                dataIndex: 'status',
                width: 120,
                render: (v: 1 | 2 | 3) => (
                    <span style={{ color: TaskStatusColorConstant[v] }}>{TaskStatusConstant[v]}</span>
                ),
            },
            {
                title: '任务时间',
                dataIndex: 'date',
                width: 300,
                render(_, record) {
                    return simpleTime(record.beginTime * 1000) + '~' + simpleTime(record.endTime * 1000);
                },
            },
            ...((tableType === TABLE_TYPE.Record
                ? [
                      {
                          title: '备注',
                          dataIndex: 'remark',
                          width: 100,
                          align: 'left',
                      },
                      {
                          title: '审核人',
                          dataIndex: 'updateBy',
                          width: 100,
                          align: 'left',
                      },
                      {
                          title: '审核时间',
                          dataIndex: 'updateTime',
                          width: 200,
                          render: (v: string) => simpleTime(v),
                      },
                      {
                          title: '申请人',
                          dataIndex: 'createBy',
                          width: 120,
                          align: 'left',
                      },
                  ]
                : []) as ColumnsType<CreatorTaskType>),
            {
                title: '申请时间',
                dataIndex: 'createTime',
                width: 160,
                render: (v: string) => simpleTime(v),
            },
            {
                title: '操作',
                dataIndex: 'ops_operation',
                fixed: 'right',
                width: 200,
                render: (v: any, record: CreatorTaskType) => {
                    return (
                        <ActionGroup
                            className="operation-btn-group"
                            btns={[
                                {
                                    title: '',
                                    icon: '',
                                    hidden: !hasFunctionPermit('btn__add__club_creator__copy'),
                                    props: {
                                        type: 'link',
                                        children: '复制',
                                        onClick() {
                                            handleCopy(record);
                                        },
                                    },
                                },
                                {
                                    title: '',
                                    icon: '',
                                    hidden:
                                        !hasFunctionPermit('btn__update__club_creator') ||
                                        [ TASK_STATUS_ENUM.Finish, TASK_STATUS_ENUM.Rejected ].includes(record.status),
                                    props: {
                                        type: 'link',
                                        children: '编辑',
                                        onClick() {
                                            handleEdit(record);
                                        },
                                    },
                                },
                                {
                                    title: '',
                                    icon: '',
                                    hidden: !hasFunctionPermit('btn__del__club_creator'),
                                    props: {
                                        type: 'link',
                                        children: '删除',
                                        danger: true,
                                        disabled: !!record.isEnable,
                                        onClick() {
                                            handleDelete(record);
                                        },
                                    },
                                },
                            ]}
                        />
                    );
                },
            },
        ];

        return {
            columns: columns,
            dataSource: tableData.data,
            rowKey: 'id',
            tableName: `operation@page__list__club_creator_task@${tableType}`,
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
            rowSelection,
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
        handleSwitch,
        hasFunctionPermit,
        handleCopy,
        handleEdit,
        handleDelete,
    ]);

    const tableNode = useMemo(() => {
        return tableType === TABLE_TYPE.Record ? (
            <div className="card-container" ref={tableEl}>
                <div className="record-table">{tableTools}</div>
                <SortableTable
                    onChangeSort={handleSort}
                    {...tableProps}
                    helperClass="row-dragging-banner"
                    mountOuterContainer
                    scroll={{ y: getTableHeight }}
                />
            </div>
        ) : (
            <div ref={tableEl}>
                <Q1Table {...tableProps} scroll={{ y: getTableHeight }} />
            </div>
        );
    }, [ getTableHeight, handleSort, tableProps, tableTools, tableType ]);
    return (
        <div className="creator-manage-page">
            <FilterBox
                context={filterers}
                query={fetchTableDataByFilter}
                tableName="clubCreatorTable"
                showAdvancedFilter={false}
                initialValues={initialValues}
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
                {tableType === TABLE_TYPE.Audit ? (
                    ''
                ) : (
                    <FilterBox.Item name="status" label="状态">
                        <Select options={CreatorTaskStatusFilterTypeOptions} placeholder="不限" allowClear />
                    </FilterBox.Item>
                )}
                <FilterBox.Item className="filterbox-compact-model" type="compactNormal">
                    <Input.Group compact>
                        <FilterBox.Item name="filterType" noStyle>
                            <Select options={CreatorTaskFilterTypeOptions} placeholder="不限" />
                        </FilterBox.Item>
                        <FilterBox.Item
                            noStyle
                            shouldUpdate={(prev, next) => {
                                return prev.filterType !== next.filterType;
                            }}
                        >
                            {({ getFieldValue }) => pickFilterItemCom(getFieldValue('filterType'))}
                        </FilterBox.Item>
                    </Input.Group>
                </FilterBox.Item>
            </FilterBox>
            {tableNode}
            <Create
                clubBoardOptions={clubBoardOptions}
                visible={editVisible}
                pageType="task"
                data={editData}
                clubDeployVersion={clubDeployVersion}
                onCancel={() => {
                    setEditVisible(false);
                }}
                onOk={handleAddOk}
            />
            <Audit
                visible={auditVisible}
                pageType="task"
                data={selectedRow}
                clubDeployVersion={clubDeployVersion}
                onCancel={() => {
                    setAuditVisible(false);
                }}
                onOk={shouldChangeTab => {
                    setAuditVisible(false);
                    fetchTableData();
                    setSelectedRow([]);
                    if (shouldChangeTab) {
                        onTabChange(TABLE_TYPE.Record);
                    }
                }}
                userName={userName}
            />
        </div>
    );
});
