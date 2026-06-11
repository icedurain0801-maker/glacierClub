import React, { useState, useCallback, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Button, Image, Input, message, Modal, Popover, Select, Spin, Tabs, Tag } from 'antd';
import { inject, observer, useObserver } from 'mobx-react';
import { ColumnsType, FilterBox, Q1Table, Q1TablePropsType } from 'q1-antd';
import { get } from 'lodash';
import type { TableRowSelection } from 'antd/es/table/interface';
import { PlusOutlined } from '@ant-design/icons';

import { useContentDialogContainer, useContentTabSearch, useReactive, useStore } from '@/context';
import { deleteDressUp, getDressUpList } from '@/api/club';
import { simpleTime } from '@/utils/date';
import ActionGroup from '@/components/ActionGroup';
import { useTableAdaptHeight } from '@/utils/tableAdapt';
import { getAppConfigCenterList } from '@/api/configCenter';
import { usePersistantFunction } from '@/hooks/state/useLatestValueRef';

import { DefaultPagination } from '@ts/enum/table';
import { BOARD_PERMIT_SEPARATE, CLUB_APP_ID } from '@ts/club';
import {
    APPROVAL_STATUS,
    ApprovalStatusColor,
    ApprovalStatusSelections,
    ApprovalStatusText,
    DRESS_ENUM,
    DressTypeText,
    DressUpListItem,
    EditDressUpData,
    LISTING_STATUS,
    ListingStatusText,
    ExpiredDatConstant,
    EXPIRED_DAY,
} from '@ts/appearance';
import { FeedbackResponseType2 } from '@ts/api';
import { OMIT_TABLE_HEIGHT } from '@ts/clientModel';

import { usePremitClubBoard } from '../board/hooks/useClubBoardOptions';
import Audit from './components/Audit';
import Create from './components/Create';
import './index.less';

export enum TABLE_TYPE {
    Record = 'Record',
    Audit = 'Audit',
}
export const TableTypeValues = [ TABLE_TYPE.Record, TABLE_TYPE.Audit ] as const;

function AppearanceListFn() {
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
        <div className="admin-polish-page appearance-manage-shell">
            <Tabs activeKey={activeKey} className="page-content-tabbox" onTabClick={handleTabClick} animated={false}>
                <Tabs.TabPane tab="装扮列表" key={TABLE_TYPE.Record}>
                    <TableList tableType={TABLE_TYPE.Record} onTabChange={handleTabChange} ref={recordRef} />
                </Tabs.TabPane>
                <Tabs.TabPane tab="审核列表" key={TABLE_TYPE.Audit}>
                    <TableList tableType={TABLE_TYPE.Audit} onTabChange={handleTabChange} ref={auditRef} />
                </Tabs.TabPane>
            </Tabs>
        </div>
    );
}

const AppearanceListBase = inject('UIState')(observer(AppearanceListFn));

export default function RecycleListAll() {
    const { Club } = useStore();
    const isLoaded = useObserver(() => Club.isLoaded);
    return isLoaded ? (
        <AppearanceListBase />
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
    const previousBoradId = useRef<string>();
    const [ initialValues, setInitialValues ] = useState(filterInit);
    const [ currentPagination, setCurrentPagination ] = useState(DefaultPagination);
    const [ selectedRow, setSelectedRow ] = useState<DressUpListItem[]>([]);
    const [ auditVisible, setAuditVisible ] = useState(false);
    const [ clubDeployVersion, setclubDeployVersion ] = useState(get(clubBoardOptions, '0.value'));
    const tableEl = useRef<HTMLDivElement>(null);
    const getTableHeight = useTableAdaptHeight(tableEl, OMIT_TABLE_HEIGHT);
    const [ tableData, setTableData ] = useState<FeedbackResponseType2<DressUpListItem[]>>({
        data: [],
        total: 0,
    });
    const [ loading, setLoading ] = useState(false);
    const [ editVisible, setEditVisible ] = useState(false);
    const getContainer = useContentDialogContainer();
    const [ editData, setEditData ] = useState<EditDressUpData>({} as EditDressUpData);
    const filterers = FilterBox.useFilterBox();
    const [ languageOptions, setLanguageOptions ] = useState<
        Array<{
            label: string;
            value: string;
        }>
    >([]);
    const [ langMap, setLangMap ] = useState<{ [k in string]: string }>({});
    const initLanguage = useRef(false);
    const {
        UIState,
        User: { name: applicant },
    } = useStore();
    const { fetchTableData } = usePersistantFunction({
        async fetchTableData() {
            try {
                setLoading(true);
                if (!initLanguage.current) {
                    const languageResponse: { language: string; code: string }[] = await getAppConfigCenterList({
                        appId: CLUB_APP_ID,
                        tableName: 'LanguageClub',
                    });
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
                    initLanguage.current = true;
                }
                const { type, boardId, filterType, date, status, ...values } = await filterers.validate();
                const query = {
                    approvalStatus:
                        tableType === TABLE_TYPE.Audit ? APPROVAL_STATUS.Waiting : status == null ? 3 : status,
                    boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1],
                    ...values,
                    ...currentPagination,
                };
                const { data, total } = await getDressUpList(query, clubDeployVersion);
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
            let { boardId, ...ret } = await filterers.validate();
            if (previousBoradId.current !== boardId) {
                setclubDeployVersion(boardId.split(BOARD_PERMIT_SEPARATE)[0]);
                fetchTableData();
            }
            setInitialValues({
                boardId,
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

    const handleAddOk = useCallback(async () => {
        if (tableType === TABLE_TYPE.Record) {
            UIState.gotoTab({
                pathname: `/game/club/appearance/index`,
                search: `?searchType=Audit`,
            });
        }
        onTabChange(TABLE_TYPE.Audit);
        setEditVisible(false);
    }, [ UIState, onTabChange, tableType ]);

    const rowSelection: TableRowSelection<DressUpListItem> | undefined = useMemo(() => {
        return tableType === TABLE_TYPE.Record
            ? undefined
            : {
                  type: 'checkbox',
                  selectedRowKeys: selectedRow.map(x => x.id),
                  columnWidth: 50,
                  onChange: (key: React.Key[], selectedRow: DressUpListItem[]) => {
                      setSelectedRow(selectedRow);
                  },
                  getCheckboxProps: (record: any) => ({
                      disabled: record.status === APPROVAL_STATUS.Rejected,
                  }),
              };
    }, [ selectedRow, tableType ]);

    function handleChange(nextPagination: any, filters: any, sorter: any) {
        setCurrentPagination({
            pageIndex: nextPagination.current,
            pageSize: nextPagination.pageSize || DefaultPagination.pageSize,
        });
    }
    const handleEdit = useCallback(
        async (record: DressUpListItem) => {
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
        (record: DressUpListItem) => {
            Modal.confirm({
                getContainer,
                content: (
                    <div>
                        <p>
                            <span>确定要删除当前装扮吗？</span>
                        </p>
                    </div>
                ),
                onOk: async () => {
                    const res = await deleteDressUp(record.id, clubDeployVersion);
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
    const tableProps: Q1TablePropsType<DressUpListItem> = useMemo(() => {
        const columns: ColumnsType<DressUpListItem> = [
            {
                title: '装扮名称',
                dataIndex: 'id',
                width: 90,
            },
            {
                title: '装扮名称',
                dataIndex: 'name',
                width: 160,
                render(_, r) {
                    return r.dressUpInfos?.[0]?.dressName ?? '';
                },
            },
            {
                title: '装扮ICON',
                dataIndex: 'iconUrl',
                width: 120,
                render(v) {
                    return <Image src={v} className="appearance-list__table__record__image" />;
                },
            },
            {
                title: '装扮类型',
                dataIndex: 'dressType',
                width: 120,
                render: v => DressTypeText[v as DRESS_ENUM],
            },
            {
                title: '上架方式',
                dataIndex: 'listingState',
                width: 150,
                render: v => ListingStatusText[v as LISTING_STATUS],
            },
            {
                title: '状态',
                dataIndex: 'approvalStatus',
                width: 150,
                render: (v: APPROVAL_STATUS) => (
                    <span style={{ color: ApprovalStatusColor[v] }}>{ApprovalStatusText[v]}</span>
                ),
            },
            {
                title: '多语言',
                dataIndex: 'dressUpInfos',
                width: 150,
                render: (txt: DressUpListItem['dressUpInfos']) => {
                    let renderHtml: React.ReactNode = '';
                    if (txt?.length > MAX_LANG_TAG_SHOW_COUNT) {
                        renderHtml = (
                            <Popover
                                title="多语言详情"
                                placement="bottom"
                                content={
                                    <div style={{ maxHeight: '50vh', maxWidth: '1200px', overflow: 'auto' }}>
                                        {txt.map((item, index: number) => (
                                            <Tag key={index} color="blue" style={{ marginBottom: '4px' }}>
                                                {langMap[item.language]}
                                            </Tag>
                                        ))}
                                    </div>
                                }
                            >
                                <div>
                                    {txt.slice(0, MAX_LANG_TAG_SHOW_COUNT).map((item, index) => (
                                        <Tag key={index} color="blue">
                                            {langMap[item.language]}
                                        </Tag>
                                    ))}
                                    <Tag color="blue">
                                        <PlusOutlined /> {txt.length - MAX_LANG_TAG_SHOW_COUNT}
                                    </Tag>
                                </div>
                            </Popover>
                        );
                    } else {
                        renderHtml = txt?.map((item, index) => (
                            <Tag key={index} color="blue">
                                {langMap[item.language]}
                            </Tag>
                        ));
                    }

                    return renderHtml;
                },
            },
            {
                title: '有效期',
                dataIndex: 'expiredDay',
                width: 150,
                render: (v: EXPIRED_DAY) => <span>{ExpiredDatConstant[v]}</span>,
            },
            ...((tableType === TABLE_TYPE.Record
                ? [
                      {
                          title: '审核人',
                          dataIndex: 'reviewer',
                          width: 100,
                          align: 'left',
                      },
                      {
                          title: '审核时间',
                          dataIndex: 'reviewTime',
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
                : []) as ColumnsType<DressUpListItem>),
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
                dataIndex: 'ops_operation',
                fixed: 'right',
                width: 150,
                render: (_, record: DressUpListItem) => {
                    return (
                        <ActionGroup
                            className="operation-btn-group"
                            btns={[
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
            tableName: `operation@page__list__club_appearance@${tableType}`,
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
        langMap,
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
                    <FilterBox.Item name="status" label="状态">
                        <Select options={ApprovalStatusSelections} allowClear />
                    </FilterBox.Item>
                ) : (
                    ''
                )}
                <FilterBox.Item name="dressName" label="装扮名称">
                    <Input placeholder="名称" allowClear />
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
                languageOptions={languageOptions}
                langMap={langMap}
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
        </div>
    );
});
