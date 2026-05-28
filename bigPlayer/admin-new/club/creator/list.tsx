import React, { useState, useCallback, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Badge, Button, DatePicker, Input, message, Modal, Select, Spin, Tabs } from 'antd';
import { inject, observer, useObserver } from 'mobx-react';
import { ColumnsType, FilterBox, Q1Table, Q1TablePropsType } from 'q1-antd';
import { get } from 'lodash';
import type { TableRowSelection } from 'antd/es/table/interface';

import { useContentDialogContainer, useContentTabSearch, useReactive, useStore } from '@/context';
import { getCreatorList, revokeCreator } from '@/api/club';
import { setUtcFormat, simpleTime } from '@/utils/date';
import ActionGroup from '@/components/ActionGroup';
import { useTableAdaptHeight } from '@/utils/tableAdapt';
import { usePersistantFunction } from '@/hooks/state/useLatestValueRef';

import { DefaultPagination } from '@ts/enum/table';
import { BOARD_PERMIT_SEPARATE } from '@ts/club';
import {
    CreateEditDataType,
    CREATOR_STATUS_ENUM,
    CreatorFilterTypeOptions,
    CreatorManagerList,
    CreatorStatusColorConstant,
    CreatorStatusConstant,
    CreatorStatusSelections,
} from '@ts/creator';
import { FeedbackResponseType2 } from '@ts/api';
import { OMIT_TABLE_HEIGHT } from '@ts/clientModel';

import { usePremitClubBoard } from '../board/hooks/useClubBoardOptions';
import Audit from './components/Audit';
import Create from './components/Create';
require('./list.less');
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
                <Tabs.TabPane tab="创作者列表" key={TABLE_TYPE.Record}>
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
        filterType: 'userId',
    };
    const previousBoradId = useRef<string>();
    const [ initialValues, setInitialValues ] = useState(filterInit);
    const [ currentPagination, setCurrentPagination ] = useState(DefaultPagination);
    const [ selectedRow, setSelectedRow ] = useState<CreatorManagerList[]>([]);
    const [ auditVisible, setAuditVisible ] = useState(false);
    const [ clubDeployVersion, setclubDeployVersion ] = useState(get(clubBoardOptions, '0.value'));
    const tableEl = useRef<HTMLDivElement>(null);
    const getTableHeight = useTableAdaptHeight(tableEl, OMIT_TABLE_HEIGHT);
    const [ tableData, setTableData ] = useState<FeedbackResponseType2<CreatorManagerList[]>>(
        {} as FeedbackResponseType2<CreatorManagerList[]>
    );
    const getContainer = useContentDialogContainer();
    const [ loading, setLoading ] = useState(false);
    const [ editVisible, setEditVisible ] = useState(false);
    const [ editData, setEditData ] = useState<CreateEditDataType>({} as CreateEditDataType);
    const filterers = FilterBox.useFilterBox();
    const {
        UIState,
        User: { name: userName },
    } = useStore();
    const { fetchTableData } = usePersistantFunction({
        async fetchTableData() {
            try {
                setLoading(true);
                const { type, boardId, filterType, date, status, ...values } = await filterers.validate();
                const query: any = {
                    status: tableType === TABLE_TYPE.Audit ? (status?.length ? status : [ 0, 2 ]) : 1,
                    boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1],
                    ...(date ? { startTime: setUtcFormat(date[0]), endTime: setUtcFormat(date[1]) } : {}),
                    ...values,
                    ...currentPagination,
                };
                const { data, total }: any = await getCreatorList(query, clubDeployVersion, tableType);
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
            previousBoradId.current = boardId;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
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
                    pathname: `/game/club/creator/list`,
                    search: `?searchType=Audit`,
                });
            }
            onTabChange(TABLE_TYPE.Audit);
            setEditVisible(false);
        },
        [ UIState, onTabChange, tableType ]
    );
    const handleRevoke = useCallback(
        (record: CreatorManagerList) => {
            Modal.confirm({
                getContainer,
                title: '系统提示',
                content: (
                    <div>
                        <p>
                            <span>确定要撤销当前创作者吗？</span>
                        </p>
                    </div>
                ),
                onOk: async () => {
                    const res = await revokeCreator({ id: record.id }, clubDeployVersion);
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
        [ clubDeployVersion, fetchTableData, getContainer ]
    );

    const rowSelection: TableRowSelection<CreatorManagerList> | undefined = useMemo(() => {
        return tableType === TABLE_TYPE.Record
            ? undefined
            : {
                  type: 'checkbox',
                  selectedRowKeys: selectedRow.map(x => x.id),
                  columnWidth: 50,
                  onChange: (key: React.Key[], selectedRow: CreatorManagerList[]) => {
                      setSelectedRow(selectedRow);
                  },
                  getCheckboxProps: (record: any) => ({
                      disabled: record.status === CREATOR_STATUS_ENUM.Rejected,
                  }),
              };
    }, [ selectedRow, tableType ]);

    function handleChange(nextPagination: any, filters: any, sorter: any) {
        setCurrentPagination({
            pageIndex: nextPagination.current,
            pageSize: nextPagination.pageSize || DefaultPagination.pageSize,
        });
    }
    const tableProps: Q1TablePropsType<CreatorManagerList> = useMemo(() => {
        const columns: ColumnsType<CreatorManagerList> = [
            {
                title: '序号',
                dataIndex: 'index',
                width: 60,
                render: (_: never, record: CreatorManagerList, index: number) => index + 1,
            } as any,
            {
                title: '大玩家ID',
                dataIndex: 'userId',
                align: 'left',
                width: 160,
            },
            {
                title: '昵称',
                dataIndex: 'nickName',
                width: 160,
            },
            {
                title: '冰川通行证ID',
                dataIndex: 'passportId',
                width: 120,
            },
            {
                title: '冰川通行证名称',
                dataIndex: 'passportName',
                width: 120,
            },
            ...(tableType === TABLE_TYPE.Audit
                ? [
                      {
                          title: '状态',
                          dataIndex: 'status',
                          width: 100,
                          render: (v: CREATOR_STATUS_ENUM) => (
                              <Badge
                                  className={v === CREATOR_STATUS_ENUM.UnAudited ? 'color-gray' : 'color-red'}
                                  status="processing"
                                  color={CreatorStatusColorConstant[v]}
                                  text={CreatorStatusConstant[v]}
                              />
                          ),
                      },
                  ]
                : []),
            {
                title: '累计获赞数',
                dataIndex: 'totalLikes',
                width: 150,
            },
            {
                title: '累计评论数',
                dataIndex: 'totalComments',
                width: 150,
            },
            {
                title: '累计粉丝数',
                dataIndex: 'totalFans',
                width: 150,
            },
            {
                title: '累计发帖数',
                dataIndex: 'totalPosts',
                width: 150,
            },
            {
                title: '累计浏览数',
                dataIndex: 'totalViews',
                width: 150,
            },
            ...((tableType === TABLE_TYPE.Record
                ? [
                      {
                          title: '审核人',
                          dataIndex: 'auditedBy',
                          width: 100,
                          align: 'left',
                      },
                      {
                          title: '备注',
                          dataIndex: 'remark',
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
                          title: '申请人',
                          dataIndex: 'applicant',
                          width: 80,
                          align: 'left',
                      },
                  ]
                : []) as ColumnsType<CreatorManagerList>),
            {
                title: '申请时间',
                dataIndex: 'applicationTime',
                width: 160,
                render: (v: string) => simpleTime(v),
            },
            ...(tableType === TABLE_TYPE.Record
                ? [
                      {
                          title: '操作',
                          dataIndex: 'ops_operation',
                          fixed: 'right',
                          width: 150,
                          render: (v: any, record: CreatorManagerList) => {
                              return (
                                  <ActionGroup
                                      className="operation-btn-group"
                                      btns={[
                                          {
                                              title: '',
                                              icon: '',
                                              props: {
                                                  type: 'link',
                                                  children: '撤销',
                                                  onClick() {
                                                      handleRevoke(record);
                                                  },
                                              },
                                          },
                                      ]}
                                  ></ActionGroup>
                              );
                          },
                      },
                  ]
                : []),
        ];

        return {
            columns: columns,
            dataSource: tableData.data,
            rowKey: 'id',
            tableName: `operation@page__list__club_creator@${tableType}`,
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
        tableData,
        tableType,
        loading,
        tableTools,
        currentPagination.pageIndex,
        currentPagination.pageSize,
        rowSelection,
        handleRevoke,
    ]);
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
                <FilterBox.Item className="filterbox-compact-model" type="compactNormal">
                    <Input.Group compact>
                        <FilterBox.Item name="filterType" noStyle>
                            <Select options={CreatorFilterTypeOptions} />
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
                {tableType === TABLE_TYPE.Audit ? (
                    <FilterBox.Item name="status" label="状态">
                        <Select options={CreatorStatusSelections} mode="multiple" allowClear />
                    </FilterBox.Item>
                ) : (
                    ''
                )}
                <FilterBox.Item name="date" label="时间">
                    <DatePicker.RangePicker format="YYYY-MM-DD HH:mm:ss" showTime />
                </FilterBox.Item>
            </FilterBox>
            <div ref={tableEl}>
                <Q1Table {...tableProps} scroll={{ y: getTableHeight }} />
            </div>
            <Create
                clubBoardOptions={clubBoardOptions}
                visible={editVisible}
                pageType="list"
                data={editData}
                clubDeployVersion={clubDeployVersion}
                onCancel={() => {
                    setEditVisible(false);
                }}
                onOk={handleAddOk}
                userName={userName}
            />
            <Audit
                visible={auditVisible}
                pageType="list"
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
