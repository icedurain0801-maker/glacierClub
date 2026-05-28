import React, { useMemo, useState, useCallback, useEffect, useRef, useImperativeHandle } from 'react';
import { inject, observer } from 'mobx-react';
import { Select, Button, message, Modal, Input, Image, Popover, Tag } from 'antd';
import { FilterBox, Q1Table, ColumnsType, Q1TablePropsType } from 'q1-antd';
import { get } from 'lodash';
import type { TableRowSelection } from 'antd/es/table/interface';

import Permissions from '@/layouts/components/permissions';
import { StoreType } from '@/store/config';
import { useTableAdaptHeight } from '@/utils/tableAdapt';
import { auditPushMessage, getPushMessageList, removePushMessage } from '@/api/club';
import { useContentDialogContainer, useContentPermissionFn } from '@/context';
import { simpleTime } from '@/utils/date';
import ActionGroup from '@/components/ActionGroup';
import { usePersistantFunction } from '@/hooks/state/useLatestValueRef';
import { usePremitClubBoard } from '@/pages/club/board/hooks/useClubBoardOptions';

import { FeedbackResponseType2 } from '@ts/api';
import { OMIT_TABLE_HEIGHT } from '@ts/clientModel';
import {
    PushMessageItem,
    BOARD_PERMIT_SEPARATE,
    PUSH_STATUS_TYPE,
    PushStatusConstants,
    PushStatusColor,
    SenderList,
    PUSH_RANGE_ENUM,
} from '@ts/club';
import { DefaultPagination } from '@ts/enum/table';

import { TABLE_TYPE } from '../index';
import Audit from './Audit';

require('./tableList.less');

interface TableListProps {
    tableType: TABLE_TYPE;
    activeTime?: number;
    statusOptions: { value: PUSH_STATUS_TYPE; label: string }[];
    onTabChange: (key: TABLE_TYPE) => void;
}
interface MobxTableListProps
    extends TableListProps,
        Pick<StoreType, 'UIState' | 'Permit' | 'Game' | 'GameContext' | 'User'> {}

interface RefMethods {
    fetchTableData: () => void;
}

// 评论列表
const TableList = React.forwardRef<RefMethods, TableListProps>((props, ref) => {
    const { statusOptions, tableType, UIState, activeTime } = props as MobxTableListProps;

    const { hasFunctionPermit } = useContentPermissionFn();

    const { clubBoardOptions } = usePremitClubBoard();
    const [ clubDeployVersion, setclubDeployVersion ] = useState(get(clubBoardOptions, '0.value'));
    const [ loading, setLoading ] = useState(false);
    const [ currentPagination, setCurrentPagination ] = useState(DefaultPagination); // 分页
    const tableEl = useRef<HTMLDivElement>(null);
    const getTableHeight = useTableAdaptHeight(tableEl, OMIT_TABLE_HEIGHT);
    const [ tableData, setTableData ] = useState<FeedbackResponseType2<PushMessageItem[]>>({
        data: [],
        total: 0,
    } as FeedbackResponseType2<PushMessageItem[]>);
    const previousBoradId = useRef<string>(); // 记录上一次的BoradId

    // 多选配置
    const [ selectedRow, setselectedRow ] = useState<PushMessageItem[]>([]);
    const [ auditVisiable, setAuditVisiable ] = useState(false);
    // form 表单查询
    const filterers = FilterBox.useFilterBox();
    const filterInit = {
        boardId: get(clubBoardOptions, '0.children.0.value'),
        sectionId: undefined,
        statuses: undefined,
        name: '',
    };

    const [ , setCurrentFromFilter ] = useState(filterInit); // 记录上一次的查询条件，为使用是否拖动使用
    const [ initialValues, setInitialValues ] = useState(filterInit);

    const { fetchTableData } = usePersistantFunction({
        fetchTableData: async () => {
            try {
                setLoading(true);
                const { statuses, boardId, title, ...values } = await filterers.validate();
                setCurrentFromFilter({ statuses, boardId, ...values } as any);
                if ([ null, undefined ].includes(boardId)) {
                    message.warn('请选择所属版块');
                    return false;
                }
                let status = tableType === TABLE_TYPE.Record ? PUSH_STATUS_TYPE.MsgAll : PUSH_STATUS_TYPE.AuditAll;
                if (statuses) {
                    status = statuses;
                }
                let query: any = {
                    ...values,
                    ...(title !== undefined ? { title } : {}),
                    boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1],
                    status,
                    ...currentPagination,
                };
                const { code, data = [], total = 0 } = await getPushMessageList(query, clubDeployVersion);
                if (code === 0) {
                    setTableData({ data, total });
                } else {
                    setTableData({ data: [], total: 0 });
                }
                setselectedRow([]);
            } catch (e) {
                console.log(e);
            } finally {
                setLoading(false);
            }
        },
    });

    useImperativeHandle(ref, () => ({
        fetchTableData,
    }));

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
            pageSize: nextPagination.pageSize || DefaultPagination.pageSize,
        });
    }

    const getContainer = useContentDialogContainer();

    const handleAudit = () => {
        setAuditVisiable(true);
    };

    const handleDelete = useCallback(
        (record: PushMessageItem) => {
            Modal.confirm({
                getContainer,
                title: '系统提示',
                content: (
                    <div>
                        <p>
                            <span>确定要删除当前消息项吗？</span>
                        </p>
                    </div>
                ),
                onOk: async () => {
                    const { boardId } = await filterers.validate();
                    const res = await removePushMessage(
                        { boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1], id: record.id },
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

    const handleRevoke = useCallback(
        (record: PushMessageItem) => {
            Modal.confirm({
                getContainer,
                title: '系统提示',
                content: (
                    <div>
                        <p>
                            <span>确定要撤回当前消息项吗？</span>
                        </p>
                    </div>
                ),
                onOk: async () => {
                    const { boardId } = await filterers.validate();
                    const res = await auditPushMessage(
                        {
                            boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1],
                            ids: [ record.id ],
                            status: PUSH_STATUS_TYPE.Retracted,
                        },
                        clubDeployVersion
                    );
                    if (res.code === 0) {
                        fetchTableData();
                        message.success('撤回成功');
                    } else {
                        message.error(res.msg || '撤回异常错误');
                    }
                },
                onCancel: () => {},
            });
        },
        [ clubDeployVersion, fetchTableData, filterers, getContainer ]
    );

    const rowSelection: TableRowSelection<PushMessageItem> | undefined = useMemo(() => {
        return tableType === TABLE_TYPE.Record
            ? undefined
            : {
                  type: 'checkbox',
                  selectedRowKeys: selectedRow.map(x => x.id),
                  columnWidth: 50,
                  onChange: (key: React.Key[], selectedRow: PushMessageItem[]) => {
                      setselectedRow(selectedRow);
                  },
                  getCheckboxProps: (record: any) => ({
                      disabled: record.status !== PUSH_STATUS_TYPE.Pending,
                  }),
              };
    }, [ selectedRow, tableType ]);

    const tableTools = useMemo(() => {
        return tableType === TABLE_TYPE.Record ? (
            <>
                <Permissions value="btn__add__club_push_message">
                    <Button
                        type="primary"
                        onClick={() => {
                            UIState.gotoTab({
                                pathname: `/club/push/create`,
                                search: `?boardId=${encodeURIComponent(
                                    initialValues.boardId
                                )}&clubDeployVersion=${clubDeployVersion}`,
                            });
                        }}
                    >
                        新增
                    </Button>
                </Permissions>
            </>
        ) : (
            <>
                <Permissions value="btn__update__club_push_audit">
                    <Button type="primary" onClick={handleAudit} disabled={!selectedRow.length}>
                        批量审核
                    </Button>
                </Permissions>
            </>
        );
    }, [ UIState, clubDeployVersion, initialValues.boardId, selectedRow.length, tableType ]);

    // 表格数据
    const tableProps: Q1TablePropsType<PushMessageItem> = useMemo(() => {
        const columns: ColumnsType<PushMessageItem> = [
            {
                title: '消息ID',
                dataIndex: 'id',
                align: 'left',
                width: 100,
            },
            {
                title: '标题',
                dataIndex: 'title',
                width: 80,
            },
            {
                title: '内容',
                dataIndex: 'content',
                render: v => <div className="push-message-content" dangerouslySetInnerHTML={{ __html: v }}></div>,
            },
            {
                title: '状态',
                dataIndex: 'status',
                width: 80,
                render: (v: PUSH_STATUS_TYPE) => (
                    <span style={{ color: PushStatusColor[v] }}>{PushStatusConstants[v]}</span>
                ),
            },
            {
                dataIndex: 'image',
                title: '图片',
                switch: 1,
                align: 'center',
                width: 100,
                render: v => {
                    return v ? (
                        <Image
                            src={v}
                            style={{ minHeight: '48px', maxHeight: '100px', minWidth: '60px', maxWidth: '180px' }}
                        />
                    ) : (
                        ''
                    );
                },
            },
            {
                title: '发送人',
                dataIndex: 'senderList',
                width: 100,
                align: 'left',
                render: (v: SenderList[], row) => {
                    if (row.isPushAll === PUSH_RANGE_ENUM.All) {
                        return <Tag color="blue">全体用户</Tag>;
                    } else {
                        return (
                            <Popover
                                content={v.map(item => (
                                    <Tag key={item.id} color="blue">{`${item.nickName}(${item.userName})`}</Tag>
                                ))}
                            >
                                <Tag color="blue">{v.length}个</Tag>
                            </Popover>
                        );
                    }
                },
            },
            {
                title: '发送时间',
                dataIndex: 'pushTime',
                width: 160,
                render: (v: string, row) => {
                    return v ? simpleTime(v) : row.auditedTime ? simpleTime(row.auditedTime) : '';
                },
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
                      {
                          title: '审核备注',
                          dataIndex: 'remark',
                          width: 160,
                          ellipsis: true,
                          render: v => v ?? '',
                      },
                  ]
                : []) as ColumnsType<PushMessageItem>),
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
                width: 150,
                resizable: false,
                fixed: 'right',
                render: (v: any, record: PushMessageItem) => {
                    return (
                        <ActionGroup
                            className="operation-btn-group"
                            btns={[
                                {
                                    title: '',
                                    icon: '',
                                    hidden:
                                        !hasFunctionPermit('btn__update__club_push_message') ||
                                        record.status === PUSH_STATUS_TYPE.Sended,
                                    props: {
                                        type: 'link',
                                        children: '编辑',
                                        onClick: () => {
                                            UIState.gotoTab({
                                                pathname: `/club/push/edit/${record.id}`,
                                                search: `?boardId=${encodeURIComponent(initialValues.boardId)}`,
                                            });
                                        },
                                    },
                                },
                                {
                                    title: '',
                                    icon: '',
                                    hidden:
                                        !hasFunctionPermit('btn__del__club_push_message') ||
                                        ![ PUSH_STATUS_TYPE.Pending, PUSH_STATUS_TYPE.Expired ].includes(record.status),
                                    props: {
                                        type: 'link',
                                        children: '删除',
                                        onClick: () => handleDelete(record),
                                    },
                                },
                                {
                                    title: '',
                                    icon: '',
                                    hidden:
                                        !hasFunctionPermit('btn__update__club_pushMessage_revert') ||
                                        tableType !== TABLE_TYPE.Record ||
                                        record.status !== PUSH_STATUS_TYPE.Approved,
                                    props: {
                                        type: 'link',
                                        children: '撤回',
                                        onClick: () => {
                                            handleRevoke(record);
                                        },
                                    },
                                },
                                {
                                    title: '',
                                    icon: '',
                                    hidden:
                                        !hasFunctionPermit('btn__add__club_pushMessage_copy') ||
                                        tableType !== TABLE_TYPE.Record,
                                    props: {
                                        type: 'link',
                                        children: '复制',
                                        onClick: () => {
                                            UIState.gotoTab({
                                                pathname: `/club/push/copy/${record.id}`,
                                                search: `?boardId=${encodeURIComponent(initialValues.boardId)}`,
                                            });
                                        },
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
            tableName: `operation@page__list__club_pushMessage@${tableType}`,
            loading,
            tableTools,
            scroll: { y: getTableHeight, ...(tableType === TABLE_TYPE.Record ? { x: 1700 } : {}) },
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
        getTableHeight,
        currentPagination.pageIndex,
        currentPagination.pageSize,
        rowSelection,
        hasFunctionPermit,
        UIState,
        initialValues.boardId,
        handleDelete,
        handleRevoke,
    ]);

    const tableNode = useMemo(() => {
        return (
            <div ref={tableEl}>
                <Q1Table {...tableProps} />
            </div>
        );
    }, [ tableProps ]);

    return (
        <div className="push-message-list">
            <FilterBox
                context={filterers}
                query={fetchTableDataByFilter}
                tableName="club-push-message"
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
                <FilterBox.Item name="statuses" label="状态">
                    <Select options={statusOptions} onChange={handleFormChange} placeholder="不限" allowClear></Select>
                </FilterBox.Item>

                <FilterBox.Item name="title" label="消息标题">
                    <Input placeholder="请输入" maxLength={50} onChange={handleFormChange} allowClear />
                </FilterBox.Item>
            </FilterBox>
            {tableNode}
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
});

export default inject('UIState', 'Permit', 'GameContext', 'User', 'Club')(observer(TableList));
