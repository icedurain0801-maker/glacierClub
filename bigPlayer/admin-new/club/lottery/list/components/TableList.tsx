import { Button, Input, message, Modal, Popover, Select, Switch, Tag } from 'antd';
import { get, sortBy } from 'lodash';
import { inject, observer } from 'mobx-react';
import { ColumnsType, FilterBox, Q1Table, Q1TablePropsType } from 'q1-antd';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TableRowSelection } from 'antd/es/table/interface';
import moment from 'moment';
import { PlusOutlined } from '@ant-design/icons';

import Permissions from '@/layouts/components/permissions';
import { delLottery, enableLottery, getLotteryList } from '@/api/club';
import { usePersistantFunction } from '@/hooks/state/useLatestValueRef';
import { usePremitClubBoard } from '@/pages/club/board/hooks/useClubBoardOptions';
import { StoreType } from '@/store/config';
import ActionGroup from '@/components/ActionGroup';
import { useTableAdaptHeight } from '@/utils/tableAdapt';
import { useContentDialogContainer, useContentPermissionFn, useReactive } from '@/context';
import { simpleTime } from '@/utils/date';

import { FeedbackResponseType2 } from '@ts/api';
import {
    BOARD_PERMIT_SEPARATE,
    CLUB_ENVIRONMENT_ENUM,
    LotteryListResponse,
    LotteryStatusColor,
    LotteryStatusConstant,
    LOTTERY_STATUS,
} from '@ts/club';
import { paginationType } from '@ts/common';
import { OMIT_TABLE_HEIGHT } from '@ts/clientModel';

import { TABLE_TYPE } from '../index';
import Audit from './Audit';
import Provide from './Provide';

const defaultPagination: paginationType = {
    pageIndex: 1,
    pageSize: 10,
};
interface TableListProps {
    tableType: TABLE_TYPE;
    activeTime?: number;
    statusOptions: { value: LOTTERY_STATUS; label: string }[];
}
interface MobxTableListProps
    extends TableListProps,
        Pick<StoreType, 'UIState' | 'Permit' | 'Game' | 'GameContext' | 'User' | 'Club'> {}

const MAX_LANG_TAG_SHOW_COUNT = 4;

const TableList = function (props: TableListProps) {
    const { tableType, statusOptions, UIState, activeTime, Club } = props as MobxTableListProps;
    const { hasFunctionPermit } = useContentPermissionFn();
    const previousBoradId = useRef<string>(); // 记录上一次的BoradId
    const { clubBoardOptions } = usePremitClubBoard();
    const tableEl = useRef<HTMLDivElement>(null);
    const getTableHeight = useTableAdaptHeight(tableEl, OMIT_TABLE_HEIGHT);
    const filterers = FilterBox.useFilterBox();
    const [ clubDeployVersion, setclubDeployVersion ] = useState(get(clubBoardOptions, '0.value'));
    const [ currentPagination, setCurrentPagination ] = useState(defaultPagination); // 分页
    const [ auditVisiable, setAuditVisiable ] = useState(false);
    const [ loading, setLoading ] = useState(false);
    const [ tableData, setTableData ] = useState<FeedbackResponseType2<LotteryListResponse[]>>(
        {} as FeedbackResponseType2<LotteryListResponse[]>
    );
    const [ selectedRow, setselectedRow ] = useState<LotteryListResponse[]>([]);
    const [ initialValues, setInitialValues ] = useState({
        boardId: get(clubBoardOptions, '0.children.0.value'),
    });
    const [ provideVisiable, setProvideVisiable ] = useState(false);
    const [ provideRow, setProvideRow ] = useState<LotteryListResponse>();
    const getContainer = useContentDialogContainer();
    const languageOptions = useMemo(() => Club?.languageOptions || [], [ Club?.languageOptions ]);
    const langMap = useMemo(() => {
        return (languageOptions || []).reduce((acc, cur) => {
            acc[cur.value] = cur.label;
            return acc;
        }, {} as Record<string, string>);
    }, [ languageOptions ]);

    useEffect(() => {
        if (clubDeployVersion !== CLUB_ENVIRONMENT_ENUM.EN) {
            return;
        }
        if (!Club?.languageOptions?.length && !Club?.languageOptionsLoading) {
            Club?.refreshLanguageOptions?.().catch(() => {});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ clubDeployVersion ]);

    // 获取table数据
    const { fetchTableData } = usePersistantFunction({
        fetchTableData: async () => {
            try {
                setLoading(true);
                const {
                    status = tableType === TABLE_TYPE.Lottery ? null : LOTTERY_STATUS.Pending,
                    boardId,
                    ...values
                } = await filterers.validate();
                if ([ null, undefined ].includes(boardId)) {
                    message.warning('请选择所属版块');
                    return false;
                }
                let query: any = {
                    ...values,
                    status,
                    boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1],
                    ...currentPagination,
                };
                let res: any = await getLotteryList(query, clubDeployVersion);
                let { data, total } = res;
                setTableData({
                    data: data,
                    total,
                });
                setselectedRow([]);
            } catch (e) {
                console.log(e);
            } finally {
                setLoading(false);
            }
        },
    });
    useReactive(() => {
        fetchTableData();
    });
    useEffect(() => {
        let boardId = get(clubBoardOptions, '0.children.0.value');
        if (boardId) {
            fetchTableData();
            previousBoradId.current = boardId;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ activeTime ]);
    // 请求table数据
    useEffect(() => {
        fetchTableData();
    }, [ currentPagination.pageIndex, currentPagination.pageSize, fetchTableData ]);
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
    const handleFormChange = useCallback(async () => {
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
    }, [ fetchTableData, filterers ]);
    const handleAdd = useCallback(async () => {
        const boardId = initialValues.boardId.split(BOARD_PERMIT_SEPARATE)[1];
        UIState.gotoTab({
            pathname: `/game/club/lottery/create`,
            search: `?type=${'create'}&boardId=${boardId}&clubDeployVersion=${clubDeployVersion}`,
        });
    }, [ UIState, clubDeployVersion, initialValues.boardId ]);
    const handleAudit = useCallback(async () => {
        setAuditVisiable(true);
    }, []);
    const handleSwitch = useCallback(
        (record: LotteryListResponse, v: any) => {
            Modal.confirm({
                getContainer,
                title: '系统提示',
                content: (
                    <div>
                        <p className="recycleBin__delete__text">
                            <span>确定</span>
                            <span>{v ? '启用' : '停用'}</span>【<span>{record.name}</span>】？
                        </p>
                    </div>
                ),
                onOk: async () => {
                    const boardId = initialValues.boardId.split(BOARD_PERMIT_SEPARATE)[1];
                    const res = await enableLottery({ id: record.id, enable: v ? 1 : 0 }, boardId, clubDeployVersion);
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
        [ clubDeployVersion, fetchTableData, getContainer, initialValues.boardId ]
    );
    const rowSelection: TableRowSelection<LotteryListResponse> | undefined = useMemo(() => {
        return tableType === TABLE_TYPE.Lottery
            ? undefined
            : {
                  type: 'checkbox',
                  selectedRowKeys: selectedRow.map(x => x.id),
                  columnWidth: 50,
                  onChange: (key: React.Key[], selectedRow: LotteryListResponse[]) => {
                      setselectedRow(selectedRow);
                  },
              };
    }, [ selectedRow, tableType ]);

    // 分页
    function handleChange(nextPagination: any, filters: any, sorter: any) {
        setCurrentPagination({
            pageIndex: nextPagination.current,
            pageSize: nextPagination.pageSize || defaultPagination.pageSize,
        });
    }
    const handleProvide = useCallback(record => {
        setProvideVisiable(true);
        setProvideRow(record);
    }, []);
    const handleEdit = useCallback(
        (record, type) => {
            const boardId = initialValues.boardId.split(BOARD_PERMIT_SEPARATE)[1];
            UIState.gotoTab({
                pathname: `/game/club/lottery/${type}/${record.id}`,
                search: `?type=${type}&boardId=${boardId}&clubDeployVersion=${clubDeployVersion}`,
            });
        },
        [ UIState, clubDeployVersion, initialValues.boardId ]
    );
    const handleDelete = useCallback(
        (record: LotteryListResponse) => {
            Modal.confirm({
                getContainer,
                title: '系统提示',
                content: (
                    <div>
                        <p className="recycleBin__delete__text">
                            <span>是否确定删除</span>【<span>{record.name}</span>】<span>吗</span>？
                        </p>
                    </div>
                ),
                onOk: async () => {
                    const boardId = initialValues.boardId.split(BOARD_PERMIT_SEPARATE)[1];
                    const res = await delLottery({ id: record.id, boardId }, clubDeployVersion);
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
        [ clubDeployVersion, fetchTableData, getContainer, initialValues.boardId ]
    );

    const tableTools = useMemo(() => {
        return tableType === TABLE_TYPE.Lottery ? (
            <>
                <Permissions value="btn__add__club_lottery">
                    <Button type="primary" onClick={handleAdd}>
                        新增
                    </Button>
                </Permissions>
            </>
        ) : (
            <>
                <Permissions value="btn__examine__club_lottery_audit">
                    <Button type="primary" onClick={handleAudit} disabled={!selectedRow.length}>
                        批量审核
                    </Button>
                </Permissions>
            </>
        );
    }, [ handleAdd, handleAudit, selectedRow.length, tableType ]);

    // 表格数据
    const tableProps: Q1TablePropsType<LotteryListResponse> = useMemo(() => {
        const recordColumns: ColumnsType<LotteryListResponse> = [
            {
                title: '启用状态',
                dataIndex: 'enable',
                width: 100,
                render: (v: 0 | 1, record: LotteryListResponse) => (
                    <Switch
                        checked={!!v}
                        onChange={(e: any) => {
                            handleSwitch(record, e);
                        }}
                    ></Switch>
                ),
            },
        ];

        const columns: ColumnsType<LotteryListResponse> = [
            ...(tableType === TABLE_TYPE.Lottery ? recordColumns : []),
            {
                title: '活动ID',
                dataIndex: 'id',
                // width: 120
            },

            {
                title: '活动名称',
                dataIndex: 'name',
                // width: 200
            },
            ...(clubDeployVersion === CLUB_ENVIRONMENT_ENUM.EN
                ? ([
                      {
                          title: '多语言',
                          dataIndex: 'multiLang',
                          width: 150,
                          render: (v: any) => {
                              const multiLang = v && typeof v === 'object' ? v : {};
                              const langs = Object.keys(multiLang);
                              if (!langs.length) {
                                  return '-';
                              }
                              const sortedLangs = sortBy(langs, lang => multiLang?.[lang]?.sort);

                              if (sortedLangs.length > MAX_LANG_TAG_SHOW_COUNT) {
                                  return (
                                      <Popover
                                          title="多语言详情"
                                          placement="bottom"
                                          content={
                                              <div style={{ maxHeight: '50vh', maxWidth: '1200px', overflow: 'auto' }}>
                                                  {sortedLangs.map((item, index) => (
                                                      <Tag key={index} color="blue" style={{ marginBottom: 4 }}>
                                                          {langMap[item] || item}
                                                      </Tag>
                                                  ))}
                                              </div>
                                          }
                                      >
                                          <div>
                                              {sortedLangs.slice(0, MAX_LANG_TAG_SHOW_COUNT).map((item, index) => (
                                                  <Tag key={index} color="blue" style={{ marginBottom: 4 }}>
                                                      {langMap[item] || item}
                                                  </Tag>
                                              ))}
                                              <Tag color="blue">
                                                  <PlusOutlined /> {sortedLangs.length - MAX_LANG_TAG_SHOW_COUNT}
                                              </Tag>
                                          </div>
                                      </Popover>
                                  );
                              }

                              return sortedLangs.map((item, index) => (
                                  <Tag key={index} color="blue" style={{ marginBottom: 4 }}>
                                      {langMap[item] || item}
                                  </Tag>
                              ));
                          },
                      },
                  ] as ColumnsType<LotteryListResponse>)
                : []),
            {
                title: '状态',
                dataIndex: 'status',
                // width: 100,
                render: (v: LOTTERY_STATUS) => (
                    <span style={{ color: LotteryStatusColor[v] }}>{LotteryStatusConstant[v]}</span>
                ),
            },

            ...((tableType === TABLE_TYPE.Lottery
                ? [
                      {
                          title: '审核人',
                          dataIndex: 'auditedBy',
                          //   width: 120,
                          align: 'left',
                      },
                      {
                          title: '审核时间',
                          dataIndex: 'auditedTime',
                          //   width: 160,
                          render: (v: string) => simpleTime(v),
                      },
                      {
                          title: '审核备注',
                          dataIndex: 'auditedRemark',
                          //   width: 120,
                          align: 'left',
                      },
                  ]
                : []) as ColumnsType<LotteryListResponse>),
            {
                title: '申请人',
                dataIndex: 'updateBy',
                // width: 120,
                align: 'left',
            },
            {
                title: '申请时间',
                dataIndex: 'updateTime',
                // width: 160,
                render: (v: string) => simpleTime(v),
            },
            {
                title: '发放奖励时间',
                dataIndex: 'realRewardTime',
                // width: 160,
                render: (v: string) => simpleTime(v),
            },
            {
                title: '操作',
                dataIndex: 'operation',
                width: 180,
                resizable: false,
                render: (v: any, record: LotteryListResponse) => {
                    return (
                        <ActionGroup
                            className="operation-btn-group"
                            btns={
                                tableType === TABLE_TYPE.Lottery
                                    ? [
                                          [ LOTTERY_STATUS.Approved ].includes(record.status)
                                              ? //   moment().isSameOrAfter(moment(record?.rewardTime))
                                                {
                                                    title: '',
                                                    icon: '',
                                                    hidden: !hasFunctionPermit(
                                                        'btn__update__club_lottery_award_provide'
                                                    ),
                                                    props: {
                                                        disabled: !record?.enable,
                                                        type: 'link',
                                                        children: '奖励发放',
                                                        onClick: () => handleProvide(record),
                                                    },
                                                }
                                              : null,
                                          [ LOTTERY_STATUS.Approved ].includes(record.status)
                                              ? {
                                                    title: '',
                                                    icon: '',
                                                    hidden: !hasFunctionPermit('btn__update__club_lottery'),
                                                    props: {
                                                        disabled: moment(record.rewardTime).isBefore(moment()),
                                                        type: 'link',
                                                        children: '编辑',
                                                        onClick: () => handleEdit(record, 'edit'),
                                                    },
                                                }
                                              : null,
                                          {
                                              title: '',
                                              icon: '',
                                              hidden: !hasFunctionPermit('btn__add__club_lottery_copy'),
                                              props: {
                                                  type: 'link',
                                                  children: '复制',
                                                  onClick: () => handleEdit(record, 'copy'),
                                              },
                                          },
                                          {
                                              title: '',
                                              icon: '',
                                              hidden: !hasFunctionPermit('btn__del__club_lottery'),
                                              props: {
                                                  type: 'link',
                                                  children: '删除',
                                                  onClick: () => handleDelete(record),
                                              },
                                          },
                                          record?.status === LOTTERY_STATUS.Over
                                              ? {
                                                    title: '',
                                                    icon: '',
                                                    hidden: !hasFunctionPermit('btn__detail__club_lottery_log'),
                                                    props: {
                                                        type: 'link',
                                                        children: '记录',
                                                        onClick: () => {
                                                            const boardId = initialValues.boardId.split(
                                                                BOARD_PERMIT_SEPARATE
                                                            )[1];
                                                            UIState.gotoTab({
                                                                pathname: `/game/club/lottery/log`,
                                                                search: `?id=${record.id}&clubDeployVersion=${clubDeployVersion}&boardId=${boardId}`,
                                                            });
                                                        },
                                                    },
                                                }
                                              : null,
                                      ]
                                    : [
                                          {
                                              title: '',
                                              icon: '',
                                              hidden: !hasFunctionPermit('btn__update__club_lottery_audit'),
                                              props: {
                                                  type: 'link',
                                                  children: '编辑',
                                                  onClick: () => handleEdit(record, 'edit'),
                                              },
                                          },
                                          {
                                              title: '',
                                              icon: '',
                                              hidden: !hasFunctionPermit('btn__del__club_lottery_audit'),
                                              props: {
                                                  type: 'link',
                                                  children: '删除',
                                                  onClick: () => handleDelete(record),
                                              },
                                          },
                                      ]
                            }
                        ></ActionGroup>
                    );
                },
            },
        ];

        return {
            columns: columns,
            dataSource: tableData.data,
            rowKey: 'id',
            tableName: `operation@page__list__club_lottery@${tableType}`,
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
        UIState,
        clubDeployVersion,
        currentPagination.pageIndex,
        currentPagination.pageSize,
        handleDelete,
        handleEdit,
        handleProvide,
        handleSwitch,
        hasFunctionPermit,
        initialValues.boardId,
        langMap,
        loading,
        rowSelection,
        tableData.data,
        tableData.total,
        tableTools,
        tableType,
    ]);

    return (
        <div className="table-list-component-page">
            <FilterBox
                context={filterers}
                query={fetchTableDataByFilter}
                tableName="clubCommentTable"
                showAdvancedFilter={false}
                initialValues={initialValues}
                key={JSON.stringify(initialValues)}
            >
                <FilterBox.Item name="boardId" label="所属版块" rules={[ { message: '请选择', required: true } ]}>
                    <Select onChange={handleFormChange}>
                        {clubBoardOptions?.map(item => {
                            return item?.children?.length ? (
                                <Select.OptGroup label={item.label} key={item.value}>
                                    {item.children.map(childItem => (
                                        <Select.Option value={childItem.value} key={childItem.value}>
                                            {childItem.label}
                                        </Select.Option>
                                    ))}
                                </Select.OptGroup>
                            ) : null;
                        })}
                    </Select>
                </FilterBox.Item>

                {tableType === TABLE_TYPE.Lottery ? (
                    <FilterBox.Item name="status" label="状态" hidden={tableType !== TABLE_TYPE.Lottery}>
                        <Select
                            options={statusOptions}
                            onChange={handleFormChange}
                            placeholder="不限"
                            allowClear
                        ></Select>
                    </FilterBox.Item>
                ) : (
                    ''
                )}

                <FilterBox.Item name="name" label="活动名称">
                    <Input placeholder="活动名称" allowClear maxLength={128} onChange={handleFormChange} />
                </FilterBox.Item>
            </FilterBox>
            <div ref={tableEl}>
                <Q1Table {...tableProps} scroll={{ y: getTableHeight }} />
            </div>
            <Audit
                visible={auditVisiable}
                data={selectedRow}
                boardId={initialValues.boardId.split(BOARD_PERMIT_SEPARATE)[1]}
                clubDeployVersion={clubDeployVersion}
                onCancel={() => {
                    setAuditVisiable(false);
                }}
                onOk={() => {
                    setAuditVisiable(false);
                    fetchTableData();
                }}
            />
            <Provide
                visible={provideVisiable}
                data={provideRow!}
                boardId={initialValues.boardId.split(BOARD_PERMIT_SEPARATE)[1]}
                clubDeployVersion={clubDeployVersion}
                onCancel={() => {
                    setProvideVisiable(false);
                }}
                onOk={() => {
                    setProvideVisiable(false);
                    fetchTableData();
                }}
            />
        </div>
    );
};

export default inject('UIState', 'Permit', 'GameContext', 'User', 'Club')(observer(TableList));
