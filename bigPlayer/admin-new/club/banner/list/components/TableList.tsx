import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { inject, observer } from 'mobx-react';
import { Image, Select, Button, message, Modal, Switch, Input } from 'antd';
import { FilterBox, Q1Table, ColumnsType, Q1TablePropsType } from 'q1-antd';
import { cloneDeep, get, keyBy } from 'lodash';
import type { TableRowSelection } from 'antd/es/table/interface';
import { arrayMoveImmutable as arrayMove } from 'array-move';
import moment from 'moment';

import Permissions from '@/layouts/components/permissions';
import { StoreType } from '@/store/config';
import { useTableAdaptHeight } from '@/utils/tableAdapt';
import { getBannerList, deleteBanner, changeBannerStatus, sortBanner, getSectionByBoard } from '@/api/club';
import { useContentDialogContainer, useContentPermissionFn } from '@/context';
import { quickPickTimeRange, simpleTime } from '@/utils/date';
import ActionGroup from '@/components/ActionGroup';
import SortableTable from '@/components/q1Table/sortableTable';
import { usePersistantFunction } from '@/hooks/state/useLatestValueRef';
import { usePremitClubBoard } from '@/pages/club/board/hooks/useClubBoardOptions';
import RangePicker from '@/components/RangePicker';

import { FeedbackResponseType2 } from '@ts/api';
import { OMIT_TABLE_HEIGHT } from '@ts/clientModel';
import { paginationType } from '@ts/common';
import {
    BannerListResponse,
    SECTION_ENUM,
    BANNER_STATUS,
    BannerStatusColor,
    BannerStatusConstant,
    SectionConstant,
    NormalOptionsType,
    MOMENT_TYPE,
    BOARD_STATUS,
    BOARD_PERMIT_SEPARATE,
    CLUB_DEPLOY_VERSION,
} from '@ts/club';

import { TABLE_TYPE } from '../index';
import Create, { POSTION_SEPARATOR } from './Create';
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
    statusOptions: { value: BANNER_STATUS; label: string }[];
}
interface MobxTableListProps
    extends TableListProps,
        Pick<StoreType, 'UIState' | 'Permit' | 'Game' | 'GameContext' | 'User'> {}

// 评论列表
const TableList: React.FC<TableListProps> = function TableList(props: TableListProps) {
    const { tableType, statusOptions, UIState, activeTime } = props as MobxTableListProps;

    const { hasFunctionPermit } = useContentPermissionFn();

    const { clubBoardOptions, boardDictForPermit } = usePremitClubBoard();
    const [ clubDeployVersion, setclubDeployVersion ] = useState(get(clubBoardOptions, '0.value'));
    const [ loading, setLoading ] = useState(false);
    const [ currentPagination, setCurrentPagination ] = useState(defaultPagination); // 分页
    const tableEl = useRef<HTMLDivElement>(null);
    const getTableHeight = useTableAdaptHeight(tableEl, OMIT_TABLE_HEIGHT);
    const [ tableData, setTableData ] = useState<FeedbackResponseType2<BannerListResponse[]>>(
        {} as FeedbackResponseType2<BannerListResponse[]>
    );
    const previousBoradId = useRef<string>(get(clubBoardOptions, '0.children.0.value')); // 记录上一次的BoradId

    // 编辑
    const [ editVisiable, setEditVisiable ] = useState(false);
    const [ editData, setEditData ] = useState<BannerListResponse | undefined>();

    // 多选配置
    const [ selectedRow, setselectedRow ] = useState<BannerListResponse[]>([]);
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
                console.log('执行fetchTableData');
                setLoading(true);
                const { status, boardId, positions, date, ...values } = await filterers.validate();
                setCurrentFromFilter({ status, boardId, ...values } as any);
                if ([ null, undefined ].includes(boardId)) {
                    message.warning('请选择所属版块');
                    return false;
                }
                let query: any = {
                    ...values,
                    boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1],
                    status: status ? String(status) : statusOptions.map(x => x.value).join(','),
                    ...(positions ? { positions: positions.join(POSTION_SEPARATOR) } : {}),
                    ...(date?.length
                        ? {
                              startTime: moment(date[0]).startOf('day').valueOf(),
                              endTime: moment(date[1]).endOf('day').valueOf(),
                          }
                        : {}),
                    ...currentPagination,
                };
                let res: any = await getBannerList(query, clubDeployVersion);
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

    const [ sectionIdOptions, setsectionIdOptions ] = useState<NormalOptionsType[]>(sectionIdDefault);

    const sectionIdDict = useMemo(() => {
        return keyBy(sectionIdOptions, 'value');
    }, [ sectionIdOptions ]);

    // 获取栏目
    const { fetchSectionList } = usePersistantFunction({
        fetchSectionList: async (board: string) => {
            console.log('boardId===>', board);
            let [ clubDeployVersion, boardId ] = board.split(BOARD_PERMIT_SEPARATE);
            const { data = [] } = await getSectionByBoard({ boardId }, clubDeployVersion as CLUB_DEPLOY_VERSION);
            setsectionIdOptions([
                ...sectionIdDefault,
                ...data
                    .filter(x => x.parentId === 0 && x.type !== MOMENT_TYPE.Feeling) // 不展示子集与动态
                    .map(x => ({
                        label: x.name,
                        value: x.id,
                    })),
            ]);
        },
    });

    useEffect(() => {
        let boardId = get(clubBoardOptions, '0.children.0.value');
        if (boardId) {
            fetchTableData();
            fetchSectionList(previousBoradId.current ? previousBoradId.current : boardId);
            // previousBoradId.current = boardId;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ activeTime ]);
    const handleFormChange = useCallback(
        async val => {
            let { boardId, sectionId, ...ret } = await filterers.validate();
            if (previousBoradId.current !== boardId) {
                fetchSectionList(boardId);
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
        [ fetchSectionList, fetchTableData, filterers ]
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
    const handleChange = useCallback((nextPagination: any, filters: any, sorter: any) => {
        setCurrentPagination({
            pageIndex: nextPagination.current,
            pageSize: nextPagination.pageSize || defaultPagination.pageSize,
        });
    }, []);

    const getContainer = useContentDialogContainer();

    const handleAdd = useCallback(async () => {
        const { boardId } = await filterers.validate();
        if (boardDictForPermit[boardId]?.status === BOARD_STATUS.Close) {
            message.warning('该版块已停用，不可新增轮播图');
            return;
        }
        setEditVisiable(true);
        setEditData({ boardId } as any);
    }, [ boardDictForPermit, filterers ]);
    const handleAddOk = useCallback(
        async data => {
            if (!editData?.id) {
                UIState.gotoTab({
                    pathname: `/game/club/banner/list`,
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
            let data: BannerListResponse[] = arrayMove(get(tableData, 'data', []), oldIndex, newIndex);
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
                        const res = await sortBanner({ boardId: get(data, '0.boardId') }, data, clubDeployVersion);
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
    const handleSwitch = useCallback(
        (record: BannerListResponse, v: any) => {
            console.log('handleSwitch', record, v);
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
                    const res = await changeBannerStatus(
                        {
                            boardId: record.boardId,
                            id: record.id,
                            hasEnable: v ? 1 : 0,
                        },
                        record,
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
        [ clubDeployVersion, fetchTableData, getContainer ]
    );
    const handleEdit = (record: BannerListResponse) => {
        setEditVisiable(true);
        setEditData({ ...record, boardId: (previousBoradId.current as unknown) as any });
    };
    const handleDelete = useCallback(
        (record: BannerListResponse) => {
            Modal.confirm({
                getContainer,
                title: '系统提示',
                content: (
                    <div>
                        <p className="recycleBin__delete__text">
                            <span>确定删除</span>【<span>{record.name}</span>】<span>吗</span>？
                        </p>
                    </div>
                ),
                onOk: async () => {
                    const { boardId } = await filterers.validate();
                    const res = await deleteBanner(
                        { boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1], ids: [ record?.id ].join(',') },
                        clubDeployVersion
                    );
                    if (res.code === 0) {
                        fetchTableData();
                        message.success('删除成功');
                    } else {
                        message.error(res.message || '删除异常错误');
                    }
                },
                onCancel: () => {},
            });
        },
        [ clubDeployVersion, fetchTableData, filterers, getContainer ]
    );

    const rowSelection: TableRowSelection<BannerListResponse> | undefined = useMemo(() => {
        return tableType === TABLE_TYPE.Record
            ? undefined
            : {
                  type: 'checkbox',
                  selectedRowKeys: selectedRow.map(x => x.id),
                  columnWidth: 50,
                  onChange: (key: React.Key[], selectedRow: BannerListResponse[]) => {
                      setselectedRow(selectedRow);
                  },
              };
    }, [ selectedRow, tableType ]);

    const tableTools = useMemo(() => {
        return tableType === TABLE_TYPE.Record ? (
            <>
                <Permissions value="btn__add__club_banner">
                    <Button type="primary" onClick={handleAdd}>
                        新增
                    </Button>
                </Permissions>
            </>
        ) : (
            <>
                <Permissions value="btn__add__club_banner">
                    <Button type="primary" onClick={handleAdd}>
                        新增
                    </Button>
                </Permissions>
                <Permissions value="btn__update__club_banner_audit">
                    <Button type="primary" onClick={handleAudit} disabled={!selectedRow.length}>
                        批量审核
                    </Button>
                </Permissions>
            </>
        );
    }, [ handleAdd, selectedRow.length, tableType ]);

    // 表格数据
    const tableProps: Q1TablePropsType<BannerListResponse> = useMemo(() => {
        const recordColumns: ColumnsType<BannerListResponse> = [
            {
                title: '启用状态',
                dataIndex: 'hasEnable',
                width: 80,
                render: (v: boolean, record: BannerListResponse) => (
                    <Switch
                        disabled={record.status === BANNER_STATUS.Rejected}
                        checked={v}
                        onChange={(e: any) => {
                            handleSwitch(record, e);
                        }}
                    ></Switch>
                ),
            },
        ];

        const columns: ColumnsType<BannerListResponse> = [
            ...(tableType === TABLE_TYPE.Record ? recordColumns : []),
            {
                title: '名称',
                dataIndex: 'name',
                align: 'left',
            },
            {
                title: '图片',
                dataIndex: 'image',
                render: (v: string) => {
                    return <Image src={v} className="banner-list__table__record__image"></Image>;
                },
            },

            {
                title: '位置',
                dataIndex: 'positions',
                render: (v: string) => {
                    const positions = (v || '').split(POSTION_SEPARATOR);
                    const positionStr = positions
                        .map(x => {
                            return sectionIdDict[x]?.label;
                        })
                        .join('、');
                    return <span>{positionStr}</span>;
                },
            },
            {
                title: '状态',
                dataIndex: 'status',
                width: 80,
                render: (v: BANNER_STATUS) => (
                    <span style={{ color: BannerStatusColor[v] }}>{BannerStatusConstant[v]}</span>
                ),
            },
            {
                title: '跳转链接',
                dataIndex: 'redirection',
                width: 210,
                render: (v: string) => (
                    <a href={v} target="_blank">
                        <span className="world-break">{v}</span>
                    </a>
                ),
            },
            {
                title: '点击数',
                width: 100,
                dataIndex: 'visitCount',
            },
            {
                title: '点击用户数',
                width: 120,
                dataIndex: 'uniqueUserCount',
            },
            {
                title: '开始时间',
                dataIndex: 'startTime',
                width: 160,
                render: (v: string) => simpleTime(v),
            },

            {
                title: '结束时间',
                dataIndex: 'endTime',
                width: 160,
                render: (v: string) => (
                    <span className={moment(v).isBefore(moment()) ? 'color-red' : ''}>{simpleTime(v)}</span>
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
                : []) as ColumnsType<BannerListResponse>),
            {
                title: '申请人',
                dataIndex: 'creator',
                width: 80,
                align: 'left',
            },
            {
                title: '申请时间',
                dataIndex: 'createTime',
                width: 160,
                render: (v: string) => simpleTime(v),
            },
            {
                title: '操作',
                dataIndex: 'operation',
                width: 88,
                resizable: false,
                fixed: 'right',
                render: (v: any, record: BannerListResponse) => {
                    return (
                        <ActionGroup
                            className="operation-btn-group"
                            btns={[
                                {
                                    title: '',
                                    icon: '',
                                    hidden: !hasFunctionPermit('btn__update__club_banner'),
                                    props: {
                                        type: 'link',
                                        children: '编辑',
                                        onClick: () => handleEdit(record),
                                    },
                                },
                                {
                                    title: '',
                                    icon: '',
                                    hidden: !hasFunctionPermit('btn__del__club_banner'),
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
            tableName: `operation@page__list__club_banner@${tableType}`,
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
            scroll: { x: 2000 },
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
        handleChange,
        rowSelection,
        handleSwitch,
        sectionIdDict,
        hasFunctionPermit,
        handleDelete,
    ]);

    const sortableDisabled = useMemo(() => {
        const { status, name } = currentFromFilter;
        let falsityArr = [ undefined, '', null ];
        return !(falsityArr.includes(status) && falsityArr.includes(name));
    }, [ currentFromFilter ]);

    return (
        <div className="banner-list">
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

                <FilterBox.Item name="positions" label="位置">
                    <Select mode="multiple" options={sectionIdOptions} placeholder="不限" allowClear></Select>
                </FilterBox.Item>

                {tableType === TABLE_TYPE.Record ? (
                    <FilterBox.Item name="status" label="状态" hidden={tableType !== TABLE_TYPE.Record}>
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
                <FilterBox.Item name="date" label="日期选择">
                    <RangePicker allowClear ranges={quickPickTimeRange} inputReadOnly />
                </FilterBox.Item>
                <FilterBox.Item name="name" label="名称">
                    <Input placeholder="名称" maxLength={128} />
                </FilterBox.Item>
            </FilterBox>

            {tableType === TABLE_TYPE.Record ? (
                <div className="card-container">
                    <div className="record-table">{tableTools}</div>
                    <SortableTable
                        onChangeSort={handleSort}
                        {...tableProps}
                        helperClass="row-dragging-banner"
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
