import React, { useState, useCallback, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Button, Image, Input, message, Modal, Popover, Select, Spin, Tabs, Tag } from 'antd';
import { inject, observer, useObserver } from 'mobx-react';
import { ColumnsType, FilterBox, Q1Table, Q1TablePropsType } from 'q1-antd';
import { get, keyBy, sortBy } from 'lodash';
import type { TableRowSelection } from 'antd/es/table/interface';
import { PlusOutlined } from '@ant-design/icons';

import {
    useContentDialogContainer,
    useContentPermissionFn,
    useContentTabSearch,
    useReactive,
    useStore,
} from '@/context';
import { simpleTime } from '@/utils/date';
import ActionGroup from '@/components/ActionGroup';
import { useTableAdaptHeight } from '@/utils/tableAdapt';
import { getAppConfigCenterList } from '@/api/configCenter';
import { usePersistantFunction } from '@/hooks/state/useLatestValueRef';
import TableCellText from '@/components/display/Table/TableCellText';
import Permissions from '@/layouts/components/permissions';
import { getBadgeCategoryAllList, getBadgeList, removeBadge } from '@/api/clubBadge';
import { isEmpty } from '@/utils/helper';

import { DefaultPagination } from '@ts/enum/table';
import { BOARD_PERMIT_SEPARATE, CLUB_APP_ID } from '@ts/club';
import { FeedbackResponseType2 } from '@ts/api';
import { OMIT_TABLE_HEIGHT } from '@ts/clientModel';
import { TableColumnWidth } from '@ts/app';
import {
    BadgeCategoryListItem,
    BadgeConditionTypeEnum,
    BadgeConditionTypeMap,
    BadgeConditionTypeSuffixMap,
    BadgeLevelColorMap,
    BadgeLevelEnum,
    BadgeLevelMap,
    BadgeListItem,
    EditBadgeData,
    NameMultiLangType,
} from '@ts/clubBadge';
import {
    AuditStatus,
    AuditStatusClassNameConstants,
    AuditStatusConstants,
    PassAndRejectedOptions,
} from '@ts/enum/enum';

import Audit from './components/Audit';
import Create from './components/Create';
import { usePremitClubBoard } from '../../board/hooks/useClubBoardOptions';
require('./index.less');

export enum TABLE_TYPE {
    Record = 'Record',
    Audit = 'Audit',
}
export const TableTypeValues = [ TABLE_TYPE.Record, TABLE_TYPE.Audit ] as const;

function BadgeListFn() {
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
        key === TABLE_TYPE.Record ? recordRef.current?.fetchTableData() : auditRef.current?.fetchTableData();
    }, []);
    const handleTabChange = useCallback((key: string) => {
        setActiveKey((key as unknown) as TABLE_TYPE);
        key === TABLE_TYPE.Record ? recordRef.current?.fetchTableData() : auditRef.current?.fetchTableData();
    }, []);

    return (
        <>
            <Tabs activeKey={activeKey} className="page-content-tabbox" onTabClick={handleTabClick} animated={false}>
                <Tabs.TabPane tab="徽章列表" key={TABLE_TYPE.Record}>
                    <TableList tableType={TABLE_TYPE.Record} onTabChange={handleTabChange} ref={recordRef} />
                </Tabs.TabPane>
                <Tabs.TabPane tab="审核列表" key={TABLE_TYPE.Audit}>
                    <TableList tableType={TABLE_TYPE.Audit} onTabChange={handleTabChange} ref={auditRef} />
                </Tabs.TabPane>
            </Tabs>
        </>
    );
}

const BadgeListBase = inject('UIState')(observer(BadgeListFn));

export default function RecycleListAll() {
    const { Club } = useStore();
    const isLoaded = useObserver(() => Club.isLoaded);
    return isLoaded ? (
        <BadgeListBase />
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
const MAX_LANG_TAG_SHOW_COUNT = 4;

const TableList = forwardRef(({ tableType, onTabChange }: TableListProps, ref) => {
    const { clubBoardOptions } = usePremitClubBoard();
    const filterInit = {
        boardId: get(clubBoardOptions, '0.children.0.value'),
    };
    const { hasFunctionPermit } = useContentPermissionFn();
    const previousBoradId = useRef<string>();
    const [ initialValues, setInitialValues ] = useState(filterInit);
    const currentPaginationRef = useRef(DefaultPagination);
    const [ selectedRow, setSelectedRow ] = useState<BadgeListItem[]>([]);
    const [ auditVisible, setAuditVisible ] = useState(false);
    const [ clubDeployVersion, setclubDeployVersion ] = useState(get(clubBoardOptions, '0.value'));
    const tableEl = useRef<HTMLDivElement>(null);
    const getTableHeight = useTableAdaptHeight(tableEl, OMIT_TABLE_HEIGHT);
    const [ tableData, setTableData ] = useState<FeedbackResponseType2<BadgeListItem[]>>(
        {} as FeedbackResponseType2<BadgeListItem[]>
    );
    const [ loading, setLoading ] = useState(false);
    const [ editVisible, setEditVisible ] = useState(false);
    const getContainer = useContentDialogContainer();
    const [ editData, setEditData ] = useState<EditBadgeData>({} as EditBadgeData);
    const filterers = FilterBox.useFilterBox();
    const [ languageOptions, setLanguageOptions ] = useState<
        Array<{
            label: string;
            value: string;
        }>
    >([]);
    const [ langMap, setLangMap ] = useState<{ [k in string]: string }>({});
    const [ categoryList, setCategoryList ] = useState<BadgeCategoryListItem[]>([]);

    const categoryListDict = useMemo(() => {
        return keyBy(categoryList, 'id');
    }, [ categoryList ]);

    const categoryOptions = useMemo(() => {
        return categoryList.map(v => ({
            label: v.name,
            value: v.id,
        }));
    }, [ categoryList ]);

    const initRef = useRef(false);
    const { UIState } = useStore();
    const { fetchTableData, getBadgeCategoryList } = usePersistantFunction({
        async fetchTableData(shouldUpdateCategoryList = false) {
            try {
                setLoading(true);
                if (!initRef.current) {
                    const [ languageResponse, badgeCategoryResponse ] = await Promise.all([
                        getAppConfigCenterList({
                            appId: CLUB_APP_ID,
                            tableName: 'LanguageClub',
                        }),
                        getBadgeCategoryAllList(
                            {
                                boardId: filterInit.boardId.split(BOARD_PERMIT_SEPARATE)[1],
                            },
                            clubDeployVersion
                        ),
                    ]);
                    const languageOptions = languageResponse
                        .filter(v => v.code)
                        .map(v => ({
                            label: v.language,
                            value: v.code,
                        }));
                    const langMap = languageOptions.reduce((acc, cur) => {
                        acc[cur.value] = cur.label;
                        return acc;
                    }, {} as { [k in string]: string });
                    setLangMap(langMap);
                    setLanguageOptions(languageOptions);
                    if (badgeCategoryResponse.data) {
                        setCategoryList(badgeCategoryResponse.data);
                    }
                    initRef.current = true;
                }

                const { type, boardId, filterType, date, status, ...values } = await filterers.validate();
                const _boardId = boardId.split(BOARD_PERMIT_SEPARATE)[1];
                if (shouldUpdateCategoryList) {
                    await getBadgeCategoryList(_boardId);
                }
                let _status =
                    tableType === TABLE_TYPE.Record
                        ? [ AuditStatus.Pass, AuditStatus.Rejected ].join(',')
                        : [ AuditStatus.PendingReview ].join(',');

                if (!isEmpty(status)) {
                    _status = String(status);
                }

                const query = {
                    status: _status,
                    boardId: _boardId,
                    ...values,
                    ...currentPaginationRef.current,
                };
                const { data, total } = await getBadgeList(query, clubDeployVersion);
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
        async getBadgeCategoryList(boardId: string) {
            const { code, data } = await getBadgeCategoryAllList(
                {
                    boardId,
                },
                clubDeployVersion
            );
            if (code === 0 && data) {
                setCategoryList(data);
            } else {
                setCategoryList([]);
            }
        },
    });
    useImperativeHandle(ref, () => ({ fetchTableData }));

    useReactive(() => {
        if (previousBoradId.current) {
            getBadgeCategoryList(previousBoradId.current.split(BOARD_PERMIT_SEPARATE)[1]);
        }
    });

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
            let { boardId, ...ret } = await filterers.validate();
            if (previousBoradId.current !== boardId) {
                setclubDeployVersion(boardId.split(BOARD_PERMIT_SEPARATE)[0]);
                const shouldUpdateCategoryList =
                    boardId.split(BOARD_PERMIT_SEPARATE)[1] !==
                    previousBoradId?.current?.split(BOARD_PERMIT_SEPARATE)[1];
                fetchTableData(shouldUpdateCategoryList);
            }
            setInitialValues({
                boardId,
                ...ret,
            } as any);
            previousBoradId.current = boardId;
        },
        [ fetchTableData, filterers ]
    );
    const fetchTableDataByFilter = useCallback(() => {
        currentPaginationRef.current = {
            ...currentPaginationRef.current,
            pageIndex: 1,
        };
        fetchTableData();
    }, [ fetchTableData ]);
    const handleAdd = useCallback(async () => {
        const { boardId } = await filterers.validate();
        const origin = boardId.split(BOARD_PERMIT_SEPARATE)[0];
        const id = boardId.split(BOARD_PERMIT_SEPARATE)[1];
        setEditData({
            boardId,
            boardName: clubBoardOptions.find(v => v.value === origin)?.children.find(v => v.id.toString() === id)
                ?.label,
        } as any);
        setEditVisible(true);
    }, [ clubBoardOptions, filterers ]);
    const tableTools = useMemo(() => {
        return tableType === TABLE_TYPE.Record ? (
            <Permissions value="btn__add__club_badge">
                <Button type="primary" onClick={handleAdd}>
                    新增
                </Button>
            </Permissions>
        ) : (
            <Permissions value="btn__examine__club_badge">
                <Button
                    type="primary"
                    onClick={() => {
                        setAuditVisible(true);
                    }}
                    disabled={!selectedRow.length}
                >
                    批量审核
                </Button>
            </Permissions>
        );
    }, [ handleAdd, selectedRow.length, tableType ]);

    const handleAddOk = useCallback(async () => {
        UIState.gotoTab({
            pathname: `/game/club/badge/list`,
        });
        fetchTableData();
        setEditVisible(false);
    }, [ UIState, fetchTableData ]);

    const rowSelection: TableRowSelection<BadgeListItem> | undefined = useMemo(() => {
        return tableType === TABLE_TYPE.Record
            ? undefined
            : {
                  type: 'checkbox',
                  selectedRowKeys: selectedRow.map(x => x.id),
                  columnWidth: 50,
                  onChange: (key: React.Key[], selectedRow: BadgeListItem[]) => {
                      setSelectedRow(selectedRow);
                  },
                  getCheckboxProps: (record: any) => ({
                      disabled: record.status === AuditStatus.Rejected,
                  }),
              };
    }, [ selectedRow, tableType ]);

    const handlePaginationChange = useCallback(
        nextPagination => {
            currentPaginationRef.current = {
                pageIndex: nextPagination.current,
                pageSize: nextPagination.pageSize || DefaultPagination.pageSize,
            };
            fetchTableData();
        },
        [ fetchTableData ]
    );
    const handleEdit = useCallback(
        async (record: BadgeListItem) => {
            const { boardId } = await filterers.validate();
            const origin = boardId.split(BOARD_PERMIT_SEPARATE)[0];
            const id = boardId.split(BOARD_PERMIT_SEPARATE)[1];
            setEditData({
                ...record,
                boardId,
                boardName: clubBoardOptions.find(v => v.value === origin)?.children.find(v => v.id.toString() === id)
                    ?.label,
            } as any);
            setEditVisible(true);
        },
        [ clubBoardOptions, filterers ]
    );
    const handleDelete = useCallback(
        async (record: BadgeListItem) => {
            const { boardId } = await filterers.validate();
            Modal.confirm({
                getContainer,
                content: (
                    <div>
                        <p>
                            <span>确认删除当前徽章吗？</span>
                        </p>
                    </div>
                ),
                onOk: async () => {
                    const res = await removeBadge(
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
            });
        },
        [ clubDeployVersion, fetchTableData, filterers, getContainer ]
    );

    const tableProps: Q1TablePropsType<BadgeListItem> = useMemo(() => {
        const columns: ColumnsType<BadgeListItem> = [
            {
                title: '排序',
                dataIndex: 'sort',
                width: TableColumnWidth.index,
            },
            {
                title: '徽章名称',
                dataIndex: 'name',
                ellipsis: true,
                width: TableColumnWidth.normal,
            },
            {
                title: '级别',
                dataIndex: 'level',
                width: TableColumnWidth.normal,
                render: (v: BadgeLevelEnum) => {
                    return <Tag color={BadgeLevelColorMap[v]}>{BadgeLevelMap[v]}</Tag>;
                },
            },
            {
                title: '图标',
                dataIndex: 'iconUrl',
                width: TableColumnWidth.normal,
                render(v) {
                    return <Image src={v} className="club-badge-list__table__record__image" />;
                },
            },
            {
                title: '描述',
                dataIndex: 'description',
                width: 120,
                render(v: string) {
                    return <TableCellText data={v} />;
                },
            },
            ...(clubDeployVersion === 'en'
                ? [
                      {
                          title: '语言',
                          dataIndex: 'nameMultiLang',
                          width: 150,
                          render: (v: NameMultiLangType) => {
                              // 按 sort 值排序语言代码
                              const sortedLangs = sortBy(Object.keys(v), lang => v[lang].sort);

                              let renderHtml: React.ReactNode = '';

                              if (sortedLangs.length > MAX_LANG_TAG_SHOW_COUNT) {
                                  renderHtml = (
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
                              } else {
                                  renderHtml = sortedLangs.map((item, index) => (
                                      <Tag key={index} color="blue" style={{ marginBottom: 4 }}>
                                          {langMap[item] || item}
                                      </Tag>
                                  ));
                              }

                              return renderHtml;
                          },
                      },
                  ]
                : []),
            {
                title: '分类',
                dataIndex: 'categoryId',
                width: 120,
                render: (v: number) => {
                    return categoryListDict[v]?.name;
                },
            },
            {
                title: '获得条件',
                dataIndex: 'conditionType',
                width: 150,
                render: (v: BadgeConditionTypeEnum, record) => {
                    return `${BadgeConditionTypeMap[v]}，${record.conditionValue}${BadgeConditionTypeSuffixMap[v]}`;
                },
            },
            ...(tableType === TABLE_TYPE.Record
                ? [
                      {
                          title: '徽章领取人数',
                          dataIndex: 'receiveCount',
                          width: 150,
                      },
                  ]
                : []),
            {
                title: '状态',
                dataIndex: 'status',
                width: 150,
                render: (v: AuditStatus) => (
                    <span className={AuditStatusClassNameConstants[v]}>{AuditStatusConstants[v]}</span>
                ),
            },
            ...((tableType === TABLE_TYPE.Record
                ? [
                      {
                          title: '审核人',
                          dataIndex: 'auditBy',
                          width: 100,
                          align: 'left',
                      },
                      {
                          title: '审核时间',
                          dataIndex: 'auditAt',
                          width: 160,
                          render: (v: string) => simpleTime(v),
                      },
                      {
                          title: '审核备注',
                          dataIndex: 'auditRemark',
                          width: 100,
                          align: 'left',
                      },
                  ]
                : []) as ColumnsType<BadgeListItem>),
            {
                title: '申请人',
                dataIndex: 'createdBy',
                width: 80,
                align: 'left',
            },
            {
                title: '申请时间',
                dataIndex: 'createdAt',
                width: 160,
                render: (v: string) => simpleTime(v),
            },

            {
                title: '操作',
                dataIndex: 'operation',
                fixed: 'right',
                width: TableColumnWidth.operationSmall,
                render: (_, record: BadgeListItem) => {
                    return (
                        <ActionGroup
                            className="operation-btn-group"
                            btns={[
                                {
                                    title: '',
                                    icon: '',
                                    hidden: !hasFunctionPermit('btn__update__club_badge'),
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
                                    hidden: !hasFunctionPermit('btn__del__club_badge'),
                                    props: {
                                        type: 'link',
                                        children: '删除',
                                        danger: true,
                                        onClick() {
                                            handleDelete(record);
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
            tableName: `operation@page__list__club_badge@${tableType}`,
            loading,
            tableTools,
            scrollToFirstRowOnChange: true,
            pagination: {
                showSizeChanger: true,
                current: currentPaginationRef.current.pageIndex,
                pageSize: currentPaginationRef.current.pageSize,
                total: tableData.total,
                showQuickJumper: true,
                showTotal: () => `共${tableData.total}条`,
            },
            onChange: handlePaginationChange,
            rowSelection,
        };
    }, [
        categoryListDict,
        clubDeployVersion,
        handleDelete,
        handleEdit,
        handlePaginationChange,
        hasFunctionPermit,
        langMap,
        loading,
        rowSelection,
        tableData.data,
        tableData.total,
        tableTools,
        tableType,
    ]);
    return (
        <div>
            <FilterBox
                context={filterers}
                query={fetchTableDataByFilter}
                tableName="clubBadgeTable"
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
                    <FilterBox.Item name="status" label="状态">
                        <Select options={PassAndRejectedOptions} allowClear />
                    </FilterBox.Item>
                ) : null}
                <FilterBox.Item name="name" label="徽章名称" normalize={v => v?.trim()}>
                    <Input placeholder="名称" allowClear />
                </FilterBox.Item>
                <FilterBox.Item name="categoryId" label="徽章分类">
                    <Select options={categoryOptions} allowClear />
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
                languageOptions={languageOptions}
                langMap={langMap}
                categoryList={categoryList}
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
            />
        </div>
    );
});
