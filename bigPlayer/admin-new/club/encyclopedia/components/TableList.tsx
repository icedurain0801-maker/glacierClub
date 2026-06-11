import React, { useMemo, useState, useCallback, useEffect, useRef, useImperativeHandle } from 'react';
import { inject, observer } from 'mobx-react';
import { Select, Button, message, Modal, Switch, Input, Form, Popover, Tag } from 'antd';
import { FilterBox, Q1Table, ColumnsType, Q1TablePropsType } from 'q1-antd';
import { cloneDeep, get, keyBy, map, sortBy } from 'lodash';
import type { TableRowSelection } from 'antd/es/table/interface';
import { arrayMoveImmutable as arrayMove } from 'array-move';
import { OptionsType } from 'rc-select/lib/interface';
import { FormInstance } from 'antd/es/form';

import Permissions from '@/layouts/components/permissions';
import { StoreType } from '@/store/config';
import { useTableAdaptHeight } from '@/utils/tableAdapt';
import { getPediaList, sortPedia, changePediaStatus, deletePedia, getEncyclopediaGroupList } from '@/api/club';
import { getAppConfigCenterList } from '@/api/configCenter';
import { useContentDialogContainer, useContentPermissionFn } from '@/context';
import { simpleTime } from '@/utils/date';
import ActionGroup from '@/components/ActionGroup';
import SortableTable from '@/components/q1Table/sortableTable';
import { usePersistantFunction } from '@/hooks/state/useLatestValueRef';
import { usePremitClubBoard } from '@/pages/club/board/hooks/useClubBoardOptions';
import TagList from '@/components/TagList';

import { FeedbackResponseType2 } from '@ts/api';
import { OMIT_TABLE_HEIGHT } from '@ts/clientModel';
import {
    PediaListResponse,
    PEDIA_AUDIT_TYPE,
    BOARD_PERMIT_SEPARATE,
    PediaAuditStatusColor,
    PediaAuditConstants,
    Section,
    PEDIA_TYPE,
    PediaTypeConstants,
    SectionChildren,
    CLUB_DEPLOY_VERSION,
    CLUB_APP_ID,
} from '@ts/club';
import { DefaultPagination } from '@ts/enum/table';

import { TABLE_TYPE } from '../list';
import Create from './Create';
import Audit from './Audit';
import Detail from './Detail';
import { CopyStrategy } from './CopyStrategy';

import './tableList.less';

interface TableListProps {
    tableType: TABLE_TYPE;
    activeTime?: number;
    statusOptions: { value: PEDIA_AUDIT_TYPE; label: string }[];
    onTabChange: (key: TABLE_TYPE) => void;
}
interface MobxTableListProps
    extends TableListProps,
        Pick<StoreType, 'UIState' | 'Permit' | 'Game' | 'GameContext' | 'User'> {}

interface RefMethods {
    fetchTableData: () => void;
}

// 监听选项被删除就重置表单项值
export function watchStrategyGroupHandle(form: FormInstance<any>, options: OptionsType) {
    const groupId = form.getFieldValue('groupId');
    if (typeof groupId === 'number') {
        if (options.every(x => x.value !== groupId)) {
            form.setFields([ { name: 'groupId', value: undefined } ]);
            return;
        }
    }
}

// 评论列表
const TableList = React.forwardRef<RefMethods, TableListProps>((props, ref) => {
    const {
        User: { name: userName },
        tableType,
        statusOptions,
        UIState,
        activeTime,
        onTabChange,
    } = props as MobxTableListProps;
    const [ filterBoxForm ] = Form.useForm();
    const { hasFunctionPermit } = useContentPermissionFn();

    const { clubBoardOptions } = usePremitClubBoard();
    const [ clubDeployVersion, setclubDeployVersion ] = useState(get(clubBoardOptions, '0.value'));
    const [ loading, setLoading ] = useState(false);
    const [ currentPagination, setCurrentPagination ] = useState(DefaultPagination); // 分页
    const tableEl = useRef<HTMLDivElement>(null);
    const getTableHeight = useTableAdaptHeight(tableEl, OMIT_TABLE_HEIGHT);
    const [ tableData, setTableData ] = useState<FeedbackResponseType2<PediaListResponse[]>>({
        data: [],
        total: 0,
    } as FeedbackResponseType2<PediaListResponse[]>);
    const newestGroupId = useRef<number>();
    const previousBoradId = useRef<string>(); // 记录上一次的BoradId
    const [ strategyGroupLoading, setStrategyGroupLoading ] = useState(false);
    const [ strategyGroupOptions, setStrategyGroupOptions ] = useState<OptionsType>([]);
    // 记录接口获取的攻略组
    const initStrategyGroupOptionsDict = useRef<Record<string, { label: string; value: number }>>({});
    // 海外版块多语言配置
    const [ languageOptions, setLanguageOptions ] = useState<Array<{ label: string; value: string }>>([]);
    const [ langMap, setLangMap ] = useState<{ [k in string]: string }>({});
    const initLanguage = useRef(false);
    // 编辑
    const [ editVisiable, setEditVisiable ] = useState(false);
    const [ editData, setEditData ] = useState<PediaListResponse>({} as PediaListResponse);

    // 详情
    const [ detailData, setDetailData ] = useState<{
        visible: boolean;
        data: null | PediaListResponse;
    }>({
        visible: false,
        data: null,
    });

    // 多选配置
    const [ selectedRow, setselectedRow ] = useState<PediaListResponse[]>([]);
    const [ auditVisiable, setAuditVisiable ] = useState(false);

    const [ copyStrategyVisible, setCopyStrategyVisible ] = useState(false);

    // form 表单查询
    const filterers = FilterBox.useFilterBox();
    const filterInit = {
        boardId: get(clubBoardOptions, '0.children.0.value'),
        sectionId: undefined,
        statuses: undefined,
        name: '',
    };
    // 跟踪筛选区当前 boardId，用于判定海外/国内（海外版块隐藏所属攻略组筛选项）
    const [ filterBoardId, setFilterBoardId ] = useState<string>(filterInit.boardId);
    const isFilterHomeLand = (filterBoardId ?? '').startsWith('zh');

    const [ currentFromFilter, setCurrentFromFilter ] = useState(filterInit); // 记录上一次的查询条件，为使用是否拖动使用
    const [ initialValues, setInitialValues ] = useState(filterInit);

    const { fetchTableData } = usePersistantFunction({
        fetchTableData: async () => {
            try {
                setLoading(true);
                if (!initLanguage.current) {
                    const languageResponse: { language: string; code: string }[] = await getAppConfigCenterList({
                        appId: CLUB_APP_ID,
                        tableName: 'LanguageClub',
                    });
                    const nextLanguageOptions = (languageResponse || [])
                        .filter(v => v.code)
                        .map(v => ({ label: v.language, value: v.code }));
                    const nextLangMap = nextLanguageOptions.reduce((acc, cur) => {
                        acc[cur.value] = cur.label;
                        return acc;
                    }, {} as { [k in string]: string });
                    setLanguageOptions(nextLanguageOptions);
                    setLangMap(nextLangMap);
                    initLanguage.current = true;
                }
                const { statuses, boardId, groupId, ...values } = await filterers.validate();
                setCurrentFromFilter({ statuses, boardId, ...values } as any);
                if ([ null, undefined ].includes(boardId)) {
                    message.warning('请选择所属版块');
                    return false;
                }
                let status =
                    tableType === TABLE_TYPE.Record
                        ? [ PEDIA_AUDIT_TYPE.Pass, PEDIA_AUDIT_TYPE.Rejected ].join(',')
                        : [ PEDIA_AUDIT_TYPE.PenddingReview ].join(',');
                if (statuses) {
                    status = statuses;
                }
                let query: any = {
                    ...values,
                    boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1],
                    statuses: status,
                    groupId: groupId,
                    ...currentPagination,
                };
                const { code, data = [], total = 0 } = await getPediaList(query, clubDeployVersion);
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

    const getStrategyGroupFn = useCallback(
        async (v: string) => {
            const inexistenceFn = () => {
                setStrategyGroupOptions([]);
                filterBoxForm.setFields([ { name: 'groupId', value: undefined } ]);
            };
            try {
                setStrategyGroupLoading(true);
                const newBoardId = v;
                const latestClubDeployVersion = newBoardId.split(BOARD_PERMIT_SEPARATE)[0];
                const { code, data, message: msg } = await getEncyclopediaGroupList(
                    { boardId: Number(newBoardId.split(BOARD_PERMIT_SEPARATE)[1]) },
                    latestClubDeployVersion as CLUB_DEPLOY_VERSION
                );

                // 注：dev环境没有海外服务，所以实际接口请求返回的data为null，没有code等数据，不用考虑
                if (code === 0) {
                    const options = (data || [])
                        .sort(item => item.sort - item.sort)
                        .map((item, i) => ({ label: item.name, value: item.id }));
                    setStrategyGroupOptions(options);
                    filterBoxForm.setFields([ { name: 'groupId', value: options[0]?.value } ]);
                    initStrategyGroupOptionsDict.current = keyBy(options, 'value');
                    fetchTableData();
                } else {
                    inexistenceFn();
                    message.error(msg);
                }
            } catch (error) {
                inexistenceFn();
                console.log(error);
            } finally {
                setStrategyGroupLoading(false);
            }
        },
        [ fetchTableData, filterBoxForm ]
    );

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

    useEffect(() => {
        getStrategyGroupFn(filterInit.boardId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleFormChange = useCallback(
        async val => {
            let { boardId, sectionId, ...ret } = await filterBoxForm.getFieldsValue();
            if (previousBoradId.current !== boardId) {
                setclubDeployVersion(boardId.split(BOARD_PERMIT_SEPARATE)[0]);
                await fetchTableData();
            }
            setInitialValues({
                boardId,
                sectionId: undefined,
                ...ret,
            } as any);
            previousBoradId.current = boardId;
        },
        [ fetchTableData, filterBoxForm ]
    );
    const changeBoardId = useCallback(
        async v => {
            setFilterBoardId(v);
            await getStrategyGroupFn(v);
            await handleFormChange(v);
        },
        [ getStrategyGroupFn, handleFormChange ]
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

    const handleAdd = useCallback(async () => {
        const { boardId } = await filterBoxForm.getFieldsValue();
        setEditVisiable(true);
        setEditData({ boardId } as any);
    }, [ filterBoxForm ]);
    const handleAddOk = useCallback(
        async data => {
            if (tableType === TABLE_TYPE.Record) {
                UIState.gotoTab({
                    pathname: `/game/club/encyclopedia/list`,
                    search: `?searchType=Audit`,
                });
            }
            onTabChange(TABLE_TYPE.Audit);
            setEditVisiable(false);
        },
        [ UIState, onTabChange, tableType ]
    );
    const handleCopy = useCallback(() => {
        setCopyStrategyVisible(true);
    }, []);

    const handleAudit = () => {
        setAuditVisiable(true);
    };

    const handleSort = useCallback(
        ({ oldIndex, newIndex }) => {
            let oldTableData = cloneDeep(tableData);
            let result = cloneDeep(tableData);
            let data: PediaListResponse[] = arrayMove(get(tableData, 'data', []), oldIndex, newIndex);
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
                        const res = await sortPedia({ boardId: get(data, '0.boardId') }, _data, clubDeployVersion);
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
        (record: PediaListResponse, v: any) => {
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
                    const res = await changePediaStatus(
                        {
                            boardId: record.boardId,
                        },
                        { id: record.id, enable: v ? 1 : 0, updateBy: userName },
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
        [ clubDeployVersion, fetchTableData, getContainer, userName ]
    );
    const handleEdit = useCallback((record: PediaListResponse) => {
        setEditVisiable(true);
        setEditData({ ...record, boardId: (previousBoradId.current as unknown) as any });
    }, []);
    const handleDelete = useCallback(
        (record: PediaListResponse) => {
            Modal.confirm({
                getContainer,
                title: '系统提示',
                content: (
                    <div>
                        <p>
                            <span>确定要删除当前攻略吗？</span>
                        </p>
                    </div>
                ),
                onOk: async () => {
                    const { boardId } = await filterBoxForm.getFieldsValue();
                    const res = await deletePedia(
                        { boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1], ids: [ record?.id ].join(',') },
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
        [ clubDeployVersion, fetchTableData, filterBoxForm, getContainer ]
    );
    const onRowSelectionChange = useCallback(
        (keys: React.Key[], rows: PediaListResponse[]) => {
            // 限制数量逻辑
            if (tableType === TABLE_TYPE.Record && rows.length > 50) {
                message.warning('最多选择50个');
                return;
            }
            setselectedRow(rows);
        },
        [ tableType ]
    );

    const rowSelection: TableRowSelection<PediaListResponse> | undefined = useMemo(() => {
        return {
            hideDefaultSelections: true,
            type: 'checkbox',
            selectedRowKeys: selectedRow.map(x => x.id),
            columnWidth: 50,
            onChange: onRowSelectionChange,
        };
    }, [ onRowSelectionChange, selectedRow ]);

    const tableTools = useMemo(() => {
        const copyBtn = (
            <Button style={{ marginLeft: 20 }} type="primary" disabled={!selectedRow.length} onClick={handleCopy}>
                复制
            </Button>
        );
        return tableType === TABLE_TYPE.Record ? (
            <>
                <Permissions value="btn__add__club_encyclopedia">
                    <Button type="primary" onClick={handleAdd}>
                        新增
                    </Button>
                </Permissions>
                <Permissions value="btn__add__copy_club_encyclopedia">
                    {!selectedRow.length ? <Popover content="请先选择要复制的攻略">{copyBtn}</Popover> : copyBtn}
                </Permissions>
            </>
        ) : (
            <>
                <Permissions value="btn__update__club_encyclopedia_audit">
                    <Button type="primary" onClick={handleAudit} disabled={!selectedRow.length}>
                        批量审核
                    </Button>
                </Permissions>
            </>
        );
    }, [ handleAdd, handleCopy, selectedRow.length, tableType ]);

    // 表格数据
    const tableProps: Q1TablePropsType<PediaListResponse> = useMemo(() => {
        const recordColumns: ColumnsType<PediaListResponse> = [
            {
                title: '启用状态',
                dataIndex: 'enable',
                width: 80,
                render: (v: boolean, record: PediaListResponse) => (
                    <Switch
                        disabled={record.status === PEDIA_AUDIT_TYPE.Rejected}
                        checked={v}
                        onChange={(e: any) => {
                            handleSwitch(record, e);
                        }}
                    ></Switch>
                ),
            },
        ];

        const columns: ColumnsType<PediaListResponse> = [
            ...(tableType === TABLE_TYPE.Record ? recordColumns : []),
            {
                title: '攻略名称',
                dataIndex: 'name',
                align: 'left',
                width: 160,
            },
            {
                title: '攻略栏目',
                dataIndex: 'columns',
                ...(tableType === TABLE_TYPE.Record ? { width: 160 } : {}),
                render: (data: Section[], record) => {
                    const _data = record.type === PEDIA_TYPE.Toolbox ? (record.toolColumns as SectionChildren[]) : data;
                    const sectionNames = map(_data, (item: SectionChildren | Section) => item.name);
                    return data ? (
                        <TagList<string> data={sectionNames} mykey="matchWords" showNum={5} renderItem={true} />
                    ) : (
                        ''
                    );
                },
            },
            {
                title: '类型',
                dataIndex: 'type',
                width: 80,
                render: (v: PEDIA_TYPE) => <span>{PediaTypeConstants[v]}</span>,
            },
            ...(!isFilterHomeLand
                ? ([
                      {
                          title: '语言',
                          dataIndex: 'multiLangColumns',
                          width: 150,
                          render: (_: any, record: PediaListResponse) => {
                              const sourceMap =
                                  record.type === PEDIA_TYPE.Toolbox
                                      ? record.multiLangToolColumns ?? {}
                                      : record.multiLangColumns ?? {};
                              const sortedLangs = sortBy(Object.keys(sourceMap), lang => sourceMap[lang]?.sort ?? 0);
                              if (!sortedLangs.length) {
                                  return '-';
                              }
                              const MAX_SHOW = 4;
                              const renderTag = (lang: string, index: number) => (
                                  <Tag key={index} color="blue" style={{ marginBottom: 4 }}>
                                      {langMap[lang] || lang}
                                  </Tag>
                              );
                              if (sortedLangs.length > MAX_SHOW) {
                                  return (
                                      <Popover
                                          title="多语言详情"
                                          placement="bottom"
                                          content={
                                              <div
                                                  style={{
                                                      maxHeight: '50vh',
                                                      maxWidth: '1200px',
                                                      overflow: 'auto',
                                                  }}
                                              >
                                                  {sortedLangs.map(renderTag)}
                                              </div>
                                          }
                                      >
                                          <div>
                                              {sortedLangs.slice(0, MAX_SHOW).map(renderTag)}
                                              <Tag color="blue">+ {sortedLangs.length - MAX_SHOW}</Tag>
                                          </div>
                                      </Popover>
                                  );
                              }
                              return <div>{sortedLangs.map(renderTag)}</div>;
                          },
                      },
                  ] as ColumnsType<PediaListResponse>)
                : []),
            {
                title: '状态',
                dataIndex: 'status',
                width: 80,
                render: (v: PEDIA_AUDIT_TYPE) => (
                    <span style={{ color: PediaAuditStatusColor[v] }}>{PediaAuditConstants[v]}</span>
                ),
            },
            ...((tableType === TABLE_TYPE.Record
                ? [
                      {
                          title: '审核人',
                          dataIndex: 'updateBy',
                          width: 80,
                          align: 'left',
                      },
                      {
                          title: '审核时间',
                          dataIndex: 'updateTime',
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
                : []) as ColumnsType<PediaListResponse>),
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
                dataIndex: 'ops_operation',
                width: 150,
                fixed: 'right',
                render: (v: any, record: PediaListResponse) => {
                    return (
                        <ActionGroup
                            className="operation-btn-group"
                            btns={[
                                {
                                    title: '',
                                    icon: '',
                                    hidden: !hasFunctionPermit('btn__detail__club_encyclopedia'),
                                    props: {
                                        type: 'link',
                                        children: '详情',
                                        onClick: () =>
                                            setDetailData({
                                                visible: true,
                                                data: record,
                                            }),
                                    },
                                },
                                {
                                    title: '',
                                    icon: '',
                                    hidden: !hasFunctionPermit('btn__update__club_encyclopedia'),
                                    props: {
                                        type: 'link',
                                        children: '编辑',
                                        onClick: () => handleEdit(record),
                                    },
                                },
                                {
                                    title: '',
                                    icon: '',
                                    hidden: !hasFunctionPermit('btn__del__club_encyclopedia'),
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
            tableName: `operation@page__list__club_encyclopedia@${tableType}@v2`,
            loading,
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
        };
    }, [
        tableType,
        tableData.data,
        tableData.total,
        loading,
        currentPagination.pageIndex,
        currentPagination.pageSize,
        handleSwitch,
        hasFunctionPermit,
        handleEdit,
        handleDelete,
        isFilterHomeLand,
        langMap,
    ]);

    const sortableDisabled = useMemo(() => {
        const { statuses, name } = currentFromFilter;
        let falsityArr = [ undefined, '', null ];
        return !(falsityArr.includes(statuses) && falsityArr.includes(name));
    }, [ currentFromFilter ]);

    const tableNode = useMemo(() => {
        return tableType === TABLE_TYPE.Record ? (
            <div className="q1-content__main_white">
                <div className="record-table">{tableTools}</div>
                <SortableTable
                    onChangeSort={handleSort}
                    {...tableProps}
                    rowSelection={rowSelection}
                    helperClass="row-dragging-banner"
                    sortableDisabled={sortableDisabled}
                    mountOuterContainer
                    scroll={{ x: 1920 }}
                />
            </div>
        ) : (
            <div ref={tableEl}>
                <Q1Table
                    {...tableProps}
                    tableTools={tableTools}
                    rowSelection={rowSelection}
                    scroll={{ y: getTableHeight }}
                />
            </div>
        );
    }, [ getTableHeight, handleSort, rowSelection, sortableDisabled, tableProps, tableTools, tableType ]);

    useEffect(() => {
        watchStrategyGroupHandle(filterBoxForm, strategyGroupOptions);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ strategyGroupOptions ]);

    return (
        <div className="banner-list ">
            <FilterBox
                form={filterBoxForm}
                context={filterers}
                query={fetchTableDataByFilter}
                tableName="clubEncyclopediaTable"
                showAdvancedFilter={false}
                initialValues={initialValues}
            >
                <FilterBox.Item name="boardId" label="所属版块" rules={[ { message: '请选择', required: true } ]}>
                    <Select
                        onChange={v => {
                            changeBoardId(v);
                        }}
                    >
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
                    <>
                        <FilterBox.Item name="statuses" label="状态" hidden={tableType !== TABLE_TYPE.Record}>
                            <Select
                                options={statusOptions}
                                onChange={handleFormChange}
                                placeholder="不限"
                                allowClear
                            ></Select>
                        </FilterBox.Item>
                        <FilterBox.Item
                            name="groupId"
                            label="所属攻略组"
                            rules={[ { message: '请选择', required: true } ]}
                            hidden={tableType !== TABLE_TYPE.Record || !isFilterHomeLand}
                        >
                            <Select
                                loading={strategyGroupLoading}
                                options={strategyGroupOptions}
                                placeholder="不限"
                            ></Select>
                        </FilterBox.Item>
                    </>
                ) : (
                    ''
                )}

                <FilterBox.Item name="name" label="攻略名称">
                    <Input placeholder="攻略名称" maxLength={50} onChange={handleFormChange} allowClear />
                </FilterBox.Item>
            </FilterBox>
            {tableNode}
            <Create
                strategyGroupLoading={strategyGroupLoading}
                strategyGroupOptions={strategyGroupOptions}
                setStrategyGroupOptions={setStrategyGroupOptions}
                clubBoardOptions={clubBoardOptions}
                visible={editVisiable}
                data={editData}
                clubDeployVersion={clubDeployVersion}
                onCancel={() => {
                    setEditVisiable(false);
                }}
                onOk={handleAddOk}
                userName={userName}
                languageOptions={languageOptions}
                langMap={langMap}
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
                userName={userName}
            />
            <Detail
                {...detailData}
                langMap={langMap}
                clubDeployVersion={clubDeployVersion}
                onClose={() => {
                    setDetailData({
                        visible: false,
                        data: null,
                    });
                }}
            />
            <CopyStrategy
                boardId={Number(previousBoradId.current?.split(BOARD_PERMIT_SEPARATE)[1])}
                userName={userName}
                clubDeployVersion={clubDeployVersion}
                initOptionsDict={initStrategyGroupOptionsDict.current}
                visible={copyStrategyVisible}
                setVisible={setCopyStrategyVisible}
                selectData={selectedRow}
                options={strategyGroupOptions}
            />
        </div>
    );
});

export default inject('UIState', 'Permit', 'GameContext', 'User', 'Club')(observer(TableList));
