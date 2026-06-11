import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { inject, observer } from 'mobx-react';
import { Input, Select, Button, message, Modal, Form, Radio, Tag, InputNumber, TreeSelect } from 'antd';
import { FilterBox, Q1Table, ColumnsType, Q1TablePropsType } from 'q1-antd';
import { get, groupBy, keyBy, omit, uniq } from 'lodash';
import type { ButtonType } from 'antd/es/button';
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';

import Permissions from '@/layouts/components/permissions';
import { StoreType } from '@/store/config';
import { useContentDialogContainer, useContentPermissionFn } from '@/context';
import DateShortItem from '@/components/DateShortItem';
import { useTableAdaptHeight } from '@/utils/tableAdapt';
import {
    getCommentList,
    commentBatchAudit,
    commentBatchDelete,
    getSectionByBoard,
    commentToTop,
    getCommentListHref,
    commentBatchMachineAudit,
} from '@/api/club';
import ActionGroup from '@/components/ActionGroup';
import { quickPickTimeRange, setUtcEndTimeAndFormat, setUtcStartTimeAndFormat, simpleTime } from '@/utils/date';
import RangePicker from '@/components/RangePicker';
import { usePremitClubBoard } from '@/pages/club/board/hooks/useClubBoardOptions';

import { FeedbackResponseType2 } from '@ts/api';
import { OMIT_TABLE_HEIGHT } from '@ts/clientModel';
import { paginationType } from '@ts/common';
import {
    COMMENT_FILTER,
    CommentListItem,
    PASSPORT_FILTER,
    recordStatusOptionsData,
    AuditStatusColor,
    AuditStatusConstant,
    recordIncludsStatus,
    AUDIT_STATUS,
    DATE_TYPE,
    DateTypeConstant,
    DATE_VALUE,
    COMMENT_FILTER_AUDIT_OPTIONS,
    COMMENT_FILTER_RECORD_OPTIONS,
    RANGE_PICKER_LIST,
    CommentFilterData,
    CommentFilterDataConstant,
    SectionResponse,
    IdNameOptionsType,
    MOMENT_TYPE,
    BOARD_PERMIT_SEPARATE,
    PostAuditOptions,
    MachineAuditIncludsStatus,
    MAX_MACHINE_AUDIT_NUMS,
} from '@ts/club';

import { TABLE_TYPE } from '../list';
import PostContent from '../../components/PostContent';
import Totop from './ToTop';
import { sectionsS2C, transformFilterItemCom } from '../../post/components/TableList';
const defaultPagination: paginationType = {
    pageIndex: 1,
    pageSize: 10,
};
const layout = {
    labelCol: { span: 6 },
    wrapperCol: { span: 18 },
};

interface Sorter {
    sortField: string;
    sortOrder: string;
}

const RemarkMaxLength = 50; // 备注最大字数
const transformCommentFilterItemCom = function transformCommentFilterItemCom(type: COMMENT_FILTER) {
    return (
        <FilterBox.Item name={CommentFilterDataConstant[type]} noStyle>
            {[ COMMENT_FILTER.ID, COMMENT_FILTER.POST ].includes(type) ? (
                <InputNumber placeholder="请输入" style={{ width: 190 }} />
            ) : (
                <Input placeholder="请输入" style={{ width: 250 }} allowClear />
            )}
        </FilterBox.Item>
    );
};
interface TableListProps {
    tableType: TABLE_TYPE;
}
interface MobxTableListProps
    extends TableListProps,
        Pick<StoreType, 'UIState' | 'Permit' | 'Game' | 'GameContext' | 'User' | 'Club'> {}

// 评论列表
const TableList: React.FC<TableListProps> = function TableList(props: TableListProps) {
    const { tableType } = props as MobxTableListProps;
    const { hasFunctionPermit } = useContentPermissionFn();
    const [ loading, setLoading ] = useState(false);
    const { clubBoardOptions } = usePremitClubBoard();
    const [ clubDeployVersion, setclubDeployVersion ] = useState(get(clubBoardOptions, '0.value'));

    const [ currentPagination, setCurrentPagination ] = useState(defaultPagination); // 分页
    const tableEl = useRef<HTMLDivElement>(null);
    const getTableHeight = useTableAdaptHeight(tableEl, OMIT_TABLE_HEIGHT);
    const [ tableData, setTableData ] = useState<FeedbackResponseType2<CommentListItem[]>>(
        {} as FeedbackResponseType2<CommentListItem[]>
    );

    // form 表单查询
    const [ initialValues, setInitialValues ] = useState({
        commentFilterType: COMMENT_FILTER.ID,
        passportFilterType: PASSPORT_FILTER.ID,
        boardId: get(clubBoardOptions, `0.children.0.value`),
        sectionId: null,
    });

    // 排序
    const [ sorter, setSorter ] = useState<Sorter>({
        sortField: 'createTime',
        sortOrder: 'desc',
    });

    const [ selectedRow, setselectedRow ] = useState<CommentListItem[]>([]);

    // 置顶操作
    const [ visibleTotopModal, setVisibleTotopModal ] = useState(false);
    // 批量审核相关
    const [ batchAuditVisible, setBatchAuditVisible ] = useState(false);
    const [ batchAuditForm ] = Form.useForm();
    const [ batchAuditLoading, setBatchAuditLoading ] = useState(false);
    const [ sectionOptions, setSectionOptions ] = useState<IdNameOptionsType[]>([]);
    const [ sectionDict, setSectionDict ] = useState<{ [key: string]: SectionResponse[] }>({});

    // 筛选
    const filterers = FilterBox.useFilterBox();

    // 多选配置
    const rowSelection = useMemo(() => {
        return {
            selectedRowKeys: selectedRow.map(x => x?.id),
            columnWidth: 50,
            onChange: (key: React.Key[], selectedRow: CommentListItem[]) => {
                setselectedRow(selectedRow);
            },
        };
    }, [ selectedRow ]);

    const auditStatusArray = tableType === TABLE_TYPE.Audit ? MachineAuditIncludsStatus : recordIncludsStatus;

    // 获取栏目
    const fetchSectionList = useCallback(async val => {
        try {
            const [ clubDeploy, boardId ] = val.split(BOARD_PERMIT_SEPARATE);
            const { data = [] } = await getSectionByBoard({ boardId }, clubDeploy);
            if (data?.length) {
                let parentIdDict = groupBy(data, 'parentId') || {};
                let dataDict = keyBy(data, 'id');
                let nameDict: any = {};
                data.forEach(item => {
                    nameDict[item.id] =
                        item.parentId !== 0 ? `${dataDict[item.parentId].name}-${item.name}` : item.name;
                });
                setSectionDict(parentIdDict);
                setSectionOptions(sectionsS2C(data.filter(x => x.type !== MOMENT_TYPE.Image)));
            }
        } catch (e) {
            console.log(e);
        }
    }, []);

    useEffect(() => {
        fetchSectionList(get(clubBoardOptions, '0.children.0.value'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ fetchSectionList ]);

    // 请求table数据
    useEffect(() => {
        fetchTableData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ currentPagination.pageIndex, currentPagination.pageSize, sorter ]);

    // 获取table数据
    const fetchTableData = useCallback(async () => {
        try {
            setLoading(true);
            const {
                commentFilterType,
                passportFilterType,
                boardId,
                sectionId: sectionIdOrg,
                createTime,
                auditTime,
                ...values
            } = await filterers.validate();
            if ([ null, undefined ].includes(boardId)) {
                message.warning('请选择所属版块');
                return false;
            }

            let query = { boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1] };
            let sectionId = sectionIdOrg ? [ sectionIdOrg, ...(sectionDict[sectionIdOrg]?.map(x => x.id) || []) ] : null;
            const params = {
                ...values,
                sectionId,
                status: values.status || values.status === 0 ? [ values.status ] : auditStatusArray,
                createStartTime: createTime ? setUtcStartTimeAndFormat(createTime[0]) : null,
                createEndTime: createTime ? setUtcEndTimeAndFormat(createTime[1]) : null,
                auditStartTime: auditTime ? setUtcStartTimeAndFormat(auditTime[0]) : null,
                auditEndTime: auditTime ? setUtcEndTimeAndFormat(auditTime[1]) : null,
                id: values.id ? Number(values.id) : undefined,
                ...sorter,
                ...currentPagination,
            };
            const res: FeedbackResponseType2<CommentListItem[]> = await getCommentList(
                query,
                params,
                clubDeployVersion
            );
            let { data, total } = res;
            setselectedRow([]);
            setTableData({ data, total });
        } catch (e) {
            console.log(e);
        } finally {
            setLoading(false);
        }
    }, [ auditStatusArray, currentPagination, clubDeployVersion, filterers, sectionDict, sorter ]);

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
        if (sorter?.['field'] && sorter?.['order']) {
            const { field, order } = sorter;
            setSorter({
                sortField: field,
                sortOrder: order === 'ascend' ? 'asc' : 'desc',
            });
        }
    }

    // 确认删除
    const handleBatchDelete = useCallback(() => {
        Modal.confirm({
            title: '批量删除',
            content: (
                <div>
                    <p className="port__delete__text">
                        <span>删除</span>
                        <span style={{ color: '#1890ff' }}>{selectedRow.length}</span>
                        <span>个评论吗</span>？
                    </p>
                    <p className="comment_delete_tips">操作不可恢复，请谨慎操作！</p>
                </div>
            ),
            onOk: async () => {
                let query = { boardId: uniq(selectedRow.map(x => x.boardId)).join(',') };
                let data = selectedRow.map(x => x.id);
                const res: FeedbackResponseType2<any> = await commentBatchDelete(query, data, clubDeployVersion);
                if (res.code === 0) {
                    fetchTableData();
                    message.success('删除成功');
                } else {
                    message.error(res.msg || '异常错误');
                }
            },
            onCancel: () => {},
        });
    }, [ clubDeployVersion, fetchTableData, selectedRow ]);

    const getUuid = () => uuidv4();

    // 确认批量审核
    const handleBatchAuditConfirm = async () => {
        const values = await batchAuditForm.validateFields();
        const submitData = {
            ...values,
            ids: selectedRow.map(x => x.id),
        };
        setBatchAuditLoading(true);
        try {
            let query = { boardId: uniq(selectedRow.map(x => x.boardId)).join(','), code: getUuid() };
            const res = await commentBatchAudit(query, submitData, clubDeployVersion);
            if (res.code === 0) {
                setBatchAuditVisible(false);
                message.success('审核成功');
                batchAuditForm.resetFields();
                setselectedRow([]);
                fetchTableData();
            } else {
                message.error(res.msg || '异常错误');
            }
        } catch (e) {
            message.error('批量审核失败！');
        } finally {
            setBatchAuditLoading(false);
        }
    };

    // 批量审核
    const openBatchAuditModal = useCallback(() => {
        setBatchAuditVisible(true);
    }, []);

    const [ topData, settopData ] = useState<CommentListItem>();
    // 置顶
    const handleStick = useCallback(
        (row: CommentListItem) => {
            if (row?.isTop) {
                Modal.confirm({
                    title: '确定要取消置顶评论',
                    content: (
                        <div>
                            <PostContent {...(row as any)} showOriginImage={true} />
                        </div>
                    ),
                    onOk: async () => {
                        let query = { boardId: [ row?.boardId ].join(',') };
                        const res: FeedbackResponseType2<any> = await commentToTop(
                            query,
                            {
                                id: row.id,
                                isTop: 0,
                                userId: row.userId,
                                userInfoId: row.userInfoId,
                            },
                            clubDeployVersion
                        );
                        if (res.code === 0) {
                            message.success(res.msg || '操作成功');
                            fetchTableData();
                        } else {
                            message.error(res.msg || '操作失败');
                        }
                    },
                    onCancel: () => {},
                });
            } else {
                settopData({ ...row, dateValue: DATE_VALUE.Forever, dateType: DATE_TYPE.Forever } as any);
                setVisibleTotopModal(true);
            }
        },
        [ clubDeployVersion, fetchTableData ]
    );
    // 导出
    const download = useCallback(async () => {
        const {
            commentFilterType,
            passportFilterType,
            boardId,
            sectionId: sectionIdOrg,
            createTime,
            auditTime,
            ...values
        } = await filterers.validate();
        const isSearchLastWeek = Object.values(
            omit(await filterers.validate(), 'boardId', 'commentFilterType', 'passportFilterType')
        ).every(v => !v);
        if ([ null, undefined, '' ].includes(boardId)) {
            message.warning('请选择所属版块');
            return false;
        }
        let query = { boardId: [ boardId.split(BOARD_PERMIT_SEPARATE)[1] ].join(',') };
        let sectionId = sectionIdOrg ? [ sectionIdOrg, ...(sectionDict[sectionIdOrg]?.map(x => x.id) || []) ] : null;
        const params = {
            ...values,
            sectionId,
            status: values.status || values.status === 0 ? [ values.status ] : auditStatusArray,
            createStartTime: createTime
                ? setUtcStartTimeAndFormat(createTime[0])
                : isSearchLastWeek
                ? moment().subtract(1, 'weeks').utc().format()
                : null,
            createEndTime: createTime
                ? setUtcEndTimeAndFormat(createTime[1])
                : isSearchLastWeek
                ? moment().utc().format()
                : null,
            auditStartTime: auditTime ? setUtcStartTimeAndFormat(auditTime[0]) : null,
            auditEndTime: auditTime ? setUtcEndTimeAndFormat(auditTime[1]) : null,
            id: values.id ? Number(values.id) : undefined,
            pageIndex: 1,
            pageSize: 10e4,
            ...sorter,
        };
        await getCommentListHref(query, params, boardId.split(BOARD_PERMIT_SEPARATE)[0]);
    }, [ auditStatusArray, filterers, sectionDict, sorter ]);

    // 批量机审
    const [ machineAuditLoading, setMachineAuditLoading ] = useState(false);

    const handleBatchMachineAudit = useCallback(async () => {
        if (selectedRow.length > MAX_MACHINE_AUDIT_NUMS) {
            message.error(`批量审核条数不能大于${MAX_MACHINE_AUDIT_NUMS}条！`);
            return;
        }
        setMachineAuditLoading(true);
        try {
            let query: any = { boardId: uniq(selectedRow.map(x => x.boardId)).join(','), code: getUuid() };
            const res = await commentBatchMachineAudit(query, { ids: selectedRow.map(x => x.id) }, clubDeployVersion);
            if (res.code === 0) {
                setBatchAuditVisible(false);
                message.success('批量机审成功！');
                setselectedRow([]);
                fetchTableData();
            } else {
                message.error(res.msg || '异常错误');
            }
        } catch (e) {
            message.error('批量机审失败！');
        } finally {
            setMachineAuditLoading(false);
        }
    }, [ clubDeployVersion, fetchTableData, selectedRow ]);

    // 表格数据
    const tableProps: Q1TablePropsType<CommentListItem> = useMemo(() => {
        const operationColumns: ColumnsType<CommentListItem> =
            tableType === TABLE_TYPE.Record
                ? [
                      {
                          title: '操作',
                          dataIndex: 'operation',
                          key: 'operation',
                          align: 'left',
                          switch: 1,
                          disabledSwitch: true,
                          resizable: false,
                          width: 100,
                          render: (v, row: CommentListItem) => {
                              return (
                                  <ActionGroup
                                      className="operation-btn-group"
                                      btns={[
                                          {
                                              title: '',
                                              icon: '',
                                              hidden:
                                                  !hasFunctionPermit('btn__update__club_comment_toTop') ||
                                                  row?.targetId !== 0 ||
                                                  row?.parentId !== 0, // 仅第一层评论才可以置顶
                                              props: {
                                                  type: 'link' as ButtonType,
                                                  children: row?.isTop ? '取消置顶' : '置顶',
                                                  disabled: row?.status !== AUDIT_STATUS.Passed,
                                                  onClick: () => handleStick(row),
                                              },
                                          },
                                      ]}
                                  />
                              );
                          },
                      },
                  ]
                : [];
        const tableTools = (
            <>
                {tableType === TABLE_TYPE.Record ? (
                    <Permissions value="btn__del__club_comment_batchDel" name="删除">
                        <Button type="primary" onClick={handleBatchDelete} disabled={!selectedRow.length}>
                            批量删除
                        </Button>
                    </Permissions>
                ) : (
                    <>
                        <Permissions value="btn__update__club_comment_batchAudit" name="审核">
                            <Button
                                type="primary"
                                onClick={handleBatchMachineAudit}
                                disabled={!selectedRow.length}
                                loading={machineAuditLoading}
                            >
                                批量机审
                            </Button>
                        </Permissions>
                        <Permissions value="btn__update__club_comment_batchAudit" name="审核">
                            <Button type="primary" onClick={openBatchAuditModal} disabled={!selectedRow.length}>
                                批量人工复审
                            </Button>
                        </Permissions>
                    </>
                )}
            </>
        );

        const columns1 =
            tableType === TABLE_TYPE.Record
                ? [
                      {
                          title: '审核人',
                          dataIndex: 'auditedBy',
                          switch: 1,
                          disabledSwitch: true,
                          align: 'left',
                      },
                      {
                          title: '审核时间',
                          dataIndex: 'auditTime',
                          switch: 1,
                          disabledSwitch: true,
                          align: 'left',
                          render: (v: string) => {
                              return <DateShortItem formatShort="YYYY-MM-DD HH:mm:ss" date={v} />;
                          },
                      },
                  ]
                : [];

        return {
            columns: [
                {
                    title: '评论ID',
                    dataIndex: 'id',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                },
                {
                    title: '评论内容',
                    dataIndex: 'content',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                    width: 280,
                    render: (v, row) => {
                        return (
                            <>
                                <PostContent {...(row as any)} showOriginImage={true} />
                                {tableType === TABLE_TYPE.Record && (
                                    <div className="club_post_table__title">
                                        {row?.isTop === 1 && (
                                            <Tag color="#f50">
                                                <span>置顶</span>
                                                {row?.topTime ? row?.topTime : ''}
                                                {DateTypeConstant[row?.topTimeType as DATE_TYPE]}
                                                {row?.topTimeType === DATE_TYPE.Forever
                                                    ? ''
                                                    : `至${simpleTime(row?.topEndTime)}`}
                                            </Tag>
                                        )}
                                    </div>
                                )}
                            </>
                        );
                    },
                },
                {
                    title: '帖子/动态ID',
                    dataIndex: 'postId',
                },
                {
                    title: '帖子标题',
                    dataIndex: 'title',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                    width: '300',
                    render: v => v || '-',
                },
                {
                    title: '评论状态',
                    dataIndex: 'status',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                    render: v => {
                        return (
                            <span style={{ color: AuditStatusColor[v as keyof typeof AuditStatusColor] }}>
                                {AuditStatusConstant[v as keyof typeof AuditStatusConstant]}
                            </span>
                        );
                    },
                },
                {
                    title: '所属版块',
                    dataIndex: 'boardName',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                },
                {
                    title: '所属栏目',
                    dataIndex: 'sectionName',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                },
                {
                    title: '评论人昵称',
                    dataIndex: 'nickName',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                },
                {
                    title: '评论人冰川通行证ID',
                    dataIndex: 'userId',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                },
                {
                    title: '评论人冰川通行证名称',
                    dataIndex: 'userName',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                },
                {
                    title: '发布时间',
                    dataIndex: 'createTime',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                    sorter: true,
                    render: (v: string) => (v ? <DateShortItem formatShort="YYYY-MM-DD HH:mm:ss" date={v} /> : ''),
                },
                ...columns1,
                {
                    title: '备注',
                    dataIndex: 'remark',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                    ellipsis: true,
                },
                ...operationColumns,
            ] as ColumnsType<CommentListItem>,

            dataSource: tableData.data,
            rowKey: 'id',
            tableName: `operation@page__list__club_content_comment@${tableType}`,
            loading,
            tableTools,
            download: tableType === TABLE_TYPE.Record && hasFunctionPermit('btn__down__club_comment') && download,
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
            rowSelection: {
                type: 'checkbox',
                ...rowSelection,
            },
        };
    }, [
        tableType,
        handleBatchDelete,
        selectedRow.length,
        handleBatchMachineAudit,
        machineAuditLoading,
        openBatchAuditModal,
        tableData.data,
        tableData.total,
        loading,
        hasFunctionPermit,
        download,
        currentPagination.pageIndex,
        currentPagination.pageSize,
        rowSelection,
        handleStick,
    ]);

    const handleChangeBoardId = useCallback(
        async val => {
            const filter = await filterers.validate();
            fetchSectionList(val);
            setclubDeployVersion(val.split(BOARD_PERMIT_SEPARATE)[0]);
            setInitialValues({ ...filter, sectionId: null } as any);
            fetchTableData();
        },
        [ fetchSectionList, fetchTableData, filterers ]
    );
    const filterSelectionData = useMemo(() => {
        return tableType === TABLE_TYPE.Audit ? COMMENT_FILTER_AUDIT_OPTIONS : COMMENT_FILTER_RECORD_OPTIONS;
    }, [ tableType ]);
    const timePicker = useMemo(() => {
        if (tableType === TABLE_TYPE.Record) {
            return (
                <>
                    {RANGE_PICKER_LIST.map((v, i) => (
                        <FilterBox.Item {...v} key={i}>
                            <RangePicker allowClear ranges={quickPickTimeRange} inputReadOnly />
                        </FilterBox.Item>
                    ))}
                </>
            );
        }
    }, [ tableType ]);

    return (
        <>
            <FilterBox
                context={filterers}
                query={fetchTableDataByFilter}
                tableName="clubCommentTable"
                showAdvancedFilter={false}
                initialValues={initialValues}
                key={JSON.stringify(initialValues)} // 为了刷新form
            >
                <FilterBox.Item name="boardId" label="所属版块" rules={[ { message: '请选择', required: true } ]}>
                    <Select onChange={handleChangeBoardId}>
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
                <FilterBox.Item name="sectionId" label="所属栏目">
                    <TreeSelect
                        placeholder="所有栏目"
                        allowClear
                        showSearch
                        treeDefaultExpandAll
                        treeData={sectionOptions}
                    />
                </FilterBox.Item>
                <FilterBox.Item name="status" label="审核状态">
                    <Select
                        options={tableType === TABLE_TYPE.Record ? recordStatusOptionsData : PostAuditOptions}
                        allowClear
                        placeholder="不限"
                    ></Select>
                </FilterBox.Item>
                {tableType === TABLE_TYPE.Record ? (
                    <FilterBox.Item name="isTop" label="评论状态">
                        <Select
                            options={[
                                { label: '置顶评论', value: 1 },
                                { label: '普通评论', value: 0 },
                            ]}
                            allowClear
                            placeholder="不限"
                        ></Select>
                    </FilterBox.Item>
                ) : null}
                <FilterBox.Item
                    className="filterbox-compact-model"
                    type="compactNormal"
                    style={{ whiteSpace: 'nowrap' }}
                >
                    <Input.Group compact>
                        <FilterBox.Item name="commentFilterType" noStyle>
                            <Select options={CommentFilterData} />
                        </FilterBox.Item>
                        <FilterBox.Item
                            noStyle
                            shouldUpdate={(prev, next) => prev.commentFilterType !== next.commentFilterType}
                        >
                            {({ getFieldValue }) => transformCommentFilterItemCom(getFieldValue('commentFilterType'))}
                        </FilterBox.Item>
                    </Input.Group>
                </FilterBox.Item>

                <FilterBox.Item
                    className="filterbox-compact-model"
                    type="compactNormal"
                    style={{ whiteSpace: 'nowrap' }}
                >
                    <Input.Group compact>
                        <FilterBox.Item name="passportFilterType" noStyle>
                            <Select options={filterSelectionData} />
                        </FilterBox.Item>
                        <FilterBox.Item
                            noStyle
                            shouldUpdate={(prev, next) => prev.passportFilterType !== next.passportFilterType}
                        >
                            {({ getFieldValue }) => transformFilterItemCom(getFieldValue('passportFilterType'))}
                        </FilterBox.Item>
                    </Input.Group>
                </FilterBox.Item>
                {timePicker}
            </FilterBox>
            <div ref={tableEl}>
                <Q1Table {...tableProps} scroll={{ y: getTableHeight }} />
            </div>
            {/* 批量审核 */}
            <Modal
                getContainer={useContentDialogContainer()}
                title="批量审核"
                visible={batchAuditVisible}
                onCancel={() => setBatchAuditVisible(false)}
                footer={
                    <div
                        style={{
                            textAlign: 'right',
                        }}
                    >
                        <Button
                            onClick={() => {
                                setBatchAuditVisible(false);
                            }}
                            style={{ marginRight: 8 }}
                        >
                            取消
                        </Button>
                        <Button
                            loading={batchAuditLoading}
                            onClick={() => {
                                handleBatchAuditConfirm();
                            }}
                            type="primary"
                        >
                            确定
                        </Button>
                    </div>
                }
            >
                <div>
                    <p className="batch-audit-tip">
                        <span>共审核</span> <span className="color-blue">{selectedRow.length}</span>
                        <span>个评论</span>
                    </p>
                    <Form {...layout} name="batchAuditForm" form={batchAuditForm} initialValues={{ status: 1 }}>
                        <Form.Item name="status" label="审核" required>
                            <Radio.Group>
                                <Radio value={AUDIT_STATUS.Passed}>全部通过</Radio>
                                <Radio value={AUDIT_STATUS.Rejected}>全部拒绝</Radio>
                            </Radio.Group>
                        </Form.Item>
                        <Form.Item
                            name="remark"
                            label="审核备注"
                            rules={[
                                {
                                    required: true,
                                    message: '请填写审核备注！',
                                    transform: v => v && v.trim(),
                                },
                            ]}
                        >
                            <Input.TextArea
                                placeholder={`仅输入${RemarkMaxLength}个汉字`}
                                maxLength={RemarkMaxLength}
                            />
                        </Form.Item>
                    </Form>
                    <p>提示：仅支持全部通过或全部拒绝，如想查看详情，请逐条查看</p>
                </div>
            </Modal>

            <Totop
                data={topData}
                clubDeployVersion={clubDeployVersion}
                visible={visibleTotopModal}
                onOk={() => {
                    setVisibleTotopModal(false);
                    fetchTableData();
                }}
                onCancel={() => {
                    setVisibleTotopModal(false);
                }}
            />
        </>
    );
};

export default inject('UIState', 'Permit', 'GameContext', 'User', 'Club')(observer(TableList));
