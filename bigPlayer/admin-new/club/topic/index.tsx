import React, { useState, useCallback, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Button, Image, Input, message, Modal, Select, Spin, Switch, Tabs, Tag } from 'antd';
import { inject, observer, useObserver } from 'mobx-react';
import { ColumnsType, FilterBox, Q1Table, Q1TablePropsType } from 'q1-antd';
import { get } from 'lodash';
import { TableRowSelection } from 'antd/lib/table/interface';

import {
    useContentDialogContainer,
    useContentPermissionFn,
    useContentTabSearch,
    useReactive,
    useStore,
} from '@/context';
import { changeClubTopicStatus, deleteClubTopic, getClubTopicList, topTopic } from '@/api/club';
import { simpleTime } from '@/utils/date';
import ActionGroup from '@/components/ActionGroup';
import { useTableAdaptHeight } from '@/utils/tableAdapt';
import { usePersistantFunction } from '@/hooks/state/useLatestValueRef';
import { isEmpty } from '@/utils/helper';

import { DefaultPagination } from '@ts/enum/table';
import { BOARD_PERMIT_SEPARATE, BOARD_STATUS } from '@ts/club';
import { ApprovalStatusColor, ApprovalStatusSelections, ApprovalStatusText } from '@ts/appearance';
import {
    ClubTopicFilterTypeOptions,
    ClubTopicItem,
    EditClubTopicDataType,
    IS_TOP,
    IsTopOptions,
    TOPIC_STATUS,
    TOPIC_TOP_TYPE,
    TOPIC_TYPE,
    TopTopicParams,
    TopicTypeConstants,
    TopicTypeOptions,
} from '@ts/clubTopic';
import { FeedbackResponseType2 } from '@ts/api';
import { OMIT_TABLE_HEIGHT } from '@ts/clientModel';
import { IS_ENABLE } from '@ts/enum/enum';

import { usePremitClubBoard } from '../board/hooks/useClubBoardOptions';
import Audit from './components/Audit';
import Create from './components/Create';
import BatchImport from './components/BatchImport';
import './index.less';

export enum TABLE_TYPE {
    Record = 'Record',
    Audit = 'Audit',
}
export const TableTypeValues = [ TABLE_TYPE.Record, TABLE_TYPE.Audit ] as const;

function TopicListFn() {
    // 初始tabPane
    const [ activeKey, setActiveKey ] = useState<TABLE_TYPE>(TABLE_TYPE.Record);
    const urlTableType = (useContentTabSearch().get('tableType') || '') as TABLE_TYPE;
    const recordRef = useRef<{ fetchTableData(): Promise<void> }>();
    const auditRef = useRef<{ fetchTableData(): Promise<void> }>();
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
                <Tabs.TabPane tab="话题列表" key={TABLE_TYPE.Record}>
                    <TableList tableType={TABLE_TYPE.Record} onTabChange={handleTabChange} ref={recordRef} />
                </Tabs.TabPane>
                <Tabs.TabPane tab="审核列表" key={TABLE_TYPE.Audit}>
                    <TableList tableType={TABLE_TYPE.Audit} onTabChange={handleTabChange} ref={auditRef} />
                </Tabs.TabPane>
            </Tabs>
        </>
    );
}

const TopicListBase = inject('UIState')(observer(TopicListFn));

export default function RecycleListAll() {
    const { Club } = useStore();
    const isLoaded = useObserver(() => Club.isLoaded);
    return isLoaded ? (
        <TopicListBase />
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
const pickFilterItemCom = (type: string) => (
    <FilterBox.Item
        name={type}
        noStyle
        rules={
            [ 'topicId' ].includes(type)
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

const TableList = forwardRef(({ tableType, onTabChange }: TableListProps, ref) => {
    const { clubBoardOptions } = usePremitClubBoard();
    const filterInit = {
        boardId: get(clubBoardOptions, '0.children.0.value'),
        filterType: 'topicId',
    };
    const previousBoardId = useRef<string>();
    const [ initialValues, setInitialValues ] = useState(filterInit);
    const [ currentPagination, setCurrentPagination ] = useState(DefaultPagination);
    const [ selectedRow, setSelectedRow ] = useState<ClubTopicItem[]>([]);
    const [ auditVisible, setAuditVisible ] = useState(false);
    const [ clubDeployVersion, setClubDeployVersion ] = useState(get(clubBoardOptions, '0.value'));
    const tableEl = useRef<HTMLDivElement>(null);
    const getTableHeight = useTableAdaptHeight(tableEl, OMIT_TABLE_HEIGHT);
    const [ tableData, setTableData ] = useState<FeedbackResponseType2<ClubTopicItem[]>>(
        {} as FeedbackResponseType2<ClubTopicItem[]>
    );
    const [ loading, setLoading ] = useState(false);
    const [ editVisible, setEditVisible ] = useState(false);
    const getContainer = useContentDialogContainer();
    const [ editData, setEditData ] = useState<EditClubTopicDataType>({} as EditClubTopicDataType);
    const filterers = FilterBox.useFilterBox();
    const { hasFunctionPermit } = useContentPermissionFn();

    const {
        UIState,
        User: { name: applicant },
    } = useStore();
    const { fetchTableData } = usePersistantFunction({
        async fetchTableData() {
            try {
                setLoading(true);
                const { boardId, filterType, date, auditStatus, ...values } = await filterers.validate();
                const query = {
                    auditStatus:
                        tableType === TABLE_TYPE.Audit
                            ? [ TOPIC_STATUS.Waiting ]
                            : auditStatus == null || !auditStatus.length
                            ? [ TOPIC_STATUS.Approval, TOPIC_STATUS.Rejected ]
                            : auditStatus,
                    boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1],
                    ...values,
                    ...currentPagination,
                };
                const { data, total } = await getClubTopicList(query, clubDeployVersion);
                if (data == null) {
                    setTableData({ data: [], total: 0 });
                } else {
                    setTableData({ data, total });
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
                setClubDeployVersion(boardId.split(BOARD_PERMIT_SEPARATE)[0]);
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
    const tableTools = useMemo(
        () =>
            tableType === TABLE_TYPE.Record ? (
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
            ),
        [ handleAdd, selectedRow.length, tableType ]
    );
    const handleAddOk = useCallback(
        async (shouldChangeTab: boolean) => {
            if (tableType === TABLE_TYPE.Record && shouldChangeTab) {
                UIState.gotoTab({
                    pathname: `/game/club/topic/list`,
                    search: `?searchType=Audit`,
                });
                onTabChange(TABLE_TYPE.Audit);
            }
            if (!shouldChangeTab) {
                fetchTableData();
            }
            setEditVisible(false);
        },
        [ UIState, fetchTableData, onTabChange, tableType ]
    );

    const rowSelection: TableRowSelection<ClubTopicItem> | undefined = useMemo(
        () =>
            tableType === TABLE_TYPE.Record
                ? undefined
                : {
                      type: 'checkbox',
                      selectedRowKeys: selectedRow.map(x => x.id),
                      columnWidth: 50,
                      onChange: (key: React.Key[], selectedRow: ClubTopicItem[]) => {
                          setSelectedRow(selectedRow);
                      },
                      getCheckboxProps: (record: any) => ({
                          disabled: record.status === TOPIC_STATUS.Rejected,
                      }),
                  },
        [ selectedRow, tableType ]
    );
    function handleChange(nextPagination: any, filters: any, sorter: any) {
        setCurrentPagination({
            pageIndex: nextPagination.current,
            pageSize: nextPagination.pageSize || DefaultPagination.pageSize,
        });
    }
    const handleEdit = useCallback(
        async (record: ClubTopicItem) => {
            const { boardId } = await filterers.validate();
            const origin = boardId.split('&&')[0];
            const id = boardId.split('&&')[1];
            setEditData({
                boardId,
                boardName: clubBoardOptions.find(v => v.value === origin)?.children.find(v => v.id.toString() === id)
                    ?.label,
                ...record,
            } as any);
            setEditVisible(true);
        },
        [ clubBoardOptions, filterers ]
    );
    const handleDelete = useCallback(
        (record: ClubTopicItem) => {
            Modal.confirm({
                getContainer,
                content: (
                    <div>
                        <p>
                            <span>确定要删除当前话题吗？</span>
                        </p>
                    </div>
                ),
                onOk: async () => {
                    const res = await deleteClubTopic(record, clubDeployVersion);
                    if (res.code === 0) {
                        fetchTableData();
                        message.success('删除成功');
                    } else {
                        message.error(res.msg || '删除异常错误');
                    }
                },
            });
        },
        [ clubDeployVersion, fetchTableData, getContainer ]
    );
    const handleSwitch = useCallback(
        (record: ClubTopicItem, v: boolean) => {
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
                    const res = await changeClubTopicStatus(
                        { ...record, status: v ? BOARD_STATUS.Open : BOARD_STATUS.Close },
                        clubDeployVersion
                    );
                    if (res.code === 0) {
                        fetchTableData();
                        message.success('操作成功');
                    } else {
                        message.error(res.message || '操作异常');
                    }
                },
            });
        },
        [ clubDeployVersion, fetchTableData, getContainer ]
    );

    const handleUpdateTopic = useCallback(
        (options: TopTopicParams, name: string) => {
            let text = '';
            if (options.type === TOPIC_TOP_TYPE.Top) {
                text =
                    options.status === IS_ENABLE.Enable
                        ? `确定要置顶话题：【${name}】吗？`
                        : `确定要取消置顶话题：【${name}】吗？`;
            } else {
                text =
                    options.status === IS_ENABLE.Enable
                        ? `确定要推荐话题：【${name}】吗？`
                        : `确定要取消推荐话题：【${name}】吗？话题置顶的状态也会同步取消`;
            }
            Modal.confirm({
                getContainer,
                title: '系统提示',
                content: (
                    <div>
                        <span>{text}？</span>
                    </div>
                ),
                onOk: async () => {
                    const { boardId } = options;
                    const res = await topTopic({ boardId }, options, clubDeployVersion);
                    if (res.code === 0) {
                        fetchTableData();
                        message.success('操作成功');
                    } else {
                        message.error(res.message || '操作异常');
                    }
                },
            });
        },
        [ clubDeployVersion, fetchTableData, getContainer ]
    );

    const [ batchImportInfo, setBatchImportInfo ] = useState({
        visible: false,
        info: {} as ClubTopicItem,
    });

    const tableProps: Q1TablePropsType<ClubTopicItem> = useMemo(() => {
        const columns: ColumnsType<ClubTopicItem> = [
            ...(tableType === TABLE_TYPE.Record
                ? [
                      {
                          title: '启用状态',
                          dataIndex: 'status',
                          width: 80,
                          render: (v: boolean, record: ClubTopicItem) => (
                              <Switch
                                  checked={v}
                                  checkedChildren="ON"
                                  unCheckedChildren="OFF"
                                  onChange={(e: boolean) => {
                                      handleSwitch(record, e);
                                  }}
                              ></Switch>
                          ),
                      },
                  ]
                : []),
            {
                title: '话题ID',
                dataIndex: 'id',
                width: 160,
                render: (v: number, record) => {
                    return (
                        <span>
                            {v}
                            {record.isRecommend ? (
                                <Tag color="blue" style={{ marginLeft: 6 }}>
                                    推荐
                                </Tag>
                            ) : null}
                        </span>
                    );
                },
            },
            {
                title: '话题名称',
                dataIndex: 'name',
                width: 160,
            },
            {
                title: '话题类型',
                dataIndex: 'type',
                width: 160,
                render: (v: TOPIC_TYPE) => TopicTypeConstants[v],
            },
            {
                title: '话题导语',
                dataIndex: 'introduction',
                width: 160,
                ellipsis: true,
                render: v => v ?? '-',
            },
            {
                title: '话题ICON',
                dataIndex: 'icon',
                width: 120,
                render(v) {
                    return isEmpty(v) ? '-' : <Image src={v} className="topic-list__table__record__image" />;
                },
            },
            ...(tableType === TABLE_TYPE.Record
                ? [
                      {
                          title: '话题文章数',
                          dataIndex: 'articleCount',
                          width: 100,
                      },
                  ]
                : []),
            {
                title: '审核状态',
                dataIndex: 'auditStatus',
                width: 150,
                render: (v: TOPIC_STATUS) => (
                    <span style={{ color: ApprovalStatusColor[v] }}>{ApprovalStatusText[v]}</span>
                ),
            },
            ...((tableType === TABLE_TYPE.Record
                ? [
                      {
                          title: '审核人',
                          dataIndex: 'auditor',
                          width: 100,
                          align: 'left',
                      },
                      {
                          title: '审核时间',
                          dataIndex: 'auditTime',
                          width: 160,
                          render: (v: string) => simpleTime(v),
                      },
                      {
                          title: '审核备注',
                          dataIndex: 'remark',
                          width: 100,
                          align: 'left',
                      },
                  ]
                : []) as ColumnsType<ClubTopicItem>),
            {
                title: '申请人',
                dataIndex: 'applicant',
                width: 80,
                align: 'left',
            },
            {
                title: '申请时间',
                dataIndex: 'applicationTime',
                width: 160,
                render: (v: string) => simpleTime(v),
            },

            {
                title: '操作',
                dataIndex: 'operation',
                fixed: 'right',
                width: tableType === TABLE_TYPE.Record ? 240 : 160,
                render: (_, record: ClubTopicItem) => {
                    return (
                        <ActionGroup
                            className="operation-btn-group"
                            btns={[
                                {
                                    title: '',
                                    icon: '',
                                    hidden:
                                        tableType !== TABLE_TYPE.Record ||
                                        !hasFunctionPermit('btn__update__club_topic_top') ||
                                        (record.type === TOPIC_TYPE.Player && record.isRecommend === IS_TOP.No),
                                    props: {
                                        type: 'link',
                                        children: record.isTop ? '取消置顶' : '置顶',
                                        onClick() {
                                            handleUpdateTopic(
                                                {
                                                    boardId: record.boardId,
                                                    id: record.id,
                                                    type: TOPIC_TOP_TYPE.Top,
                                                    status: record.isTop ? IS_ENABLE.Unable : IS_ENABLE.Enable,
                                                },
                                                record.name
                                            );
                                        },
                                    },
                                },
                                {
                                    title: '',
                                    icon: '',
                                    hidden:
                                        tableType !== TABLE_TYPE.Record ||
                                        !hasFunctionPermit('btn__update__club_topic_recommend') ||
                                        record.type === TOPIC_TYPE.Official,
                                    props: {
                                        type: 'link',
                                        children: record.isRecommend ? '取消推荐' : '推荐',
                                        onClick() {
                                            handleUpdateTopic(
                                                {
                                                    boardId: record.boardId,
                                                    id: record.id,
                                                    type: TOPIC_TOP_TYPE.Recommend,
                                                    status: record.isRecommend ? IS_ENABLE.Unable : IS_ENABLE.Enable,
                                                },
                                                record.name
                                            );
                                        },
                                    },
                                },
                                {
                                    title: '',
                                    icon: '',
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
                                    props: {
                                        type: 'link',
                                        children: '删除',
                                        danger: true,
                                        onClick() {
                                            handleDelete(record);
                                        },
                                    },
                                },
                                {
                                    title: '',
                                    icon: '',
                                    hidden:
                                        record.auditStatus !== TOPIC_STATUS.Approval ||
                                        !hasFunctionPermit('btn__update__club_topic_recommend'),
                                    props: {
                                        type: 'link',
                                        children: '导入帖文',
                                        onClick() {
                                            setBatchImportInfo({
                                                visible: true,
                                                info: record,
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
            tableName: `operation@page__list__club_topic@${tableType}`,
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
        currentPagination.pageIndex,
        currentPagination.pageSize,
        handleDelete,
        handleEdit,
        handleSwitch,
        handleUpdateTopic,
        hasFunctionPermit,
        loading,
        rowSelection,
        tableData.data,
        tableData.total,
        tableTools,
        tableType,
    ]);
    return (
        <div className="appearance-manage-page">
            <FilterBox
                context={filterers}
                query={fetchTableDataByFilter}
                tableName="clubAppearanceTable"
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
                {tableType === TABLE_TYPE.Record ? (
                    <FilterBox.Item name="auditStatus" label="审核状态">
                        <Select options={ApprovalStatusSelections} allowClear placeholder="不限" mode="multiple" />
                    </FilterBox.Item>
                ) : (
                    ''
                )}
                <FilterBox.Item name="type" label="话题类型">
                    <Select options={TopicTypeOptions} allowClear placeholder="不限" />
                </FilterBox.Item>
                <FilterBox.Item name="isRecommend" label="是否推荐">
                    <Select options={IsTopOptions} allowClear placeholder="不限" />
                </FilterBox.Item>
                <FilterBox.Item className="filterbox-compact-model" type="compactNormal">
                    <Input.Group compact>
                        <FilterBox.Item name="filterType" noStyle>
                            <Select options={ClubTopicFilterTypeOptions} />
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
            <div ref={tableEl}>
                <Q1Table {...tableProps} scroll={{ y: getTableHeight }} />
            </div>
            <Create
                clubBoardOptions={clubBoardOptions}
                visible={editVisible}
                data={editData}
                clubDeployVersion={clubDeployVersion}
                onClose={() => {
                    setEditVisible(false);
                }}
                onOk={handleAddOk}
                applicant={applicant}
            />
            <Audit
                visible={auditVisible}
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
                reviewer={applicant}
            />
            <BatchImport
                visible={batchImportInfo.visible}
                data={batchImportInfo.info}
                clubDeployVersion={clubDeployVersion}
                onClose={() => {
                    setBatchImportInfo({
                        visible: false,
                        info: {} as ClubTopicItem,
                    });
                }}
                onOk={() => {
                    setBatchImportInfo({
                        visible: false,
                        info: {} as ClubTopicItem,
                    });
                    fetchTableData();
                }}
            />
        </div>
    );
});
