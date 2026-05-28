import { inject, observer } from 'mobx-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ColumnsType, FilterBox, Q1Table } from 'q1-antd';
import { Button, Form, Input, InputNumber, Modal, Radio, Select, TreeSelect, message } from 'antd';
import { get, groupBy, keyBy, uniq } from 'lodash';
import type { RowSelectionType } from 'antd/lib/table/interface';

import { usePremitClubBoard } from '@/pages/club/board/hooks/useClubBoardOptions';
import {
    auditCoordinatorApply,
    downloadCoordinatorApplyList,
    getCoordinatorApplyList,
    getSectionByBoard,
    removeCoordinatorApply,
} from '@/api/club';
import RangePicker from '@/components/RangePicker';
import { quickPickTimeRange, setUtcEndTimeAndFormat, setUtcStartTimeAndFormat } from '@/utils/date';
import { useContentDialogContainer, useContentPermissionFn, useReactive } from '@/context';
import { useTableAdaptHeight } from '@/utils/tableAdapt';
import { isEmpty } from '@/utils/helper';
import Permissions from '@/layouts/components/permissions';
import DateShortItem from '@/components/DateShortItem';

import { DefaultPagination } from '@ts/enum/table';
import {
    AUDIT_POST_TYPE,
    AuditPostTypeConstants,
    AuditPostTypeOptions,
    BOARD_PERMIT_SEPARATE,
    COORDINATOR_FILTER,
    CoordinatorApplyItem,
    CoordinatorFilterConstant,
    CoordinatorFilterOptions,
    CoordinatorUserFilterOptions,
    IdNameOptionsType,
    MOMENT_TYPE,
    COORDINATOR_OPERATION_STATUS,
    PostOperationStatusConstants,
    PostOperationStatusOptions,
    SIMPLE_AUDIT_STATUS,
    SectionResponse,
    SimpleAuditStatusConstants,
    SimpleAuditStatusOptions,
    SimpleAuditStatusColor,
} from '@ts/club';
import { OMIT_TABLE_HEIGHT } from '@ts/clientModel';
import { TableColumnWidth } from '@ts/app';
import { DOWNLOAD_PAGESIZE } from '@ts/api';

import { TABLE_TYPE } from '../list';
import { sectionsS2C } from '../../post/components/TableList';
import PostContent from '../../components/PostContent';

interface TableListProps {
    tableType: TABLE_TYPE;
}

const layout = {
    labelCol: { span: 6 },
    wrapperCol: { span: 18 },
};
const RemarkMaxLength = 50; // 备注最大字数

function transformFilterItemCom(type: COORDINATOR_FILTER) {
    if ([ COORDINATOR_FILTER.Id, COORDINATOR_FILTER.ObjectId, COORDINATOR_FILTER.ChannelUserId ].includes(type)) {
        return (
            <FilterBox.Item name={CoordinatorFilterConstant[type]} noStyle normalize={val => val.replace(/\D/g, '')}>
                <Input placeholder="请输入" style={{ width: 250 }} allowClear />
            </FilterBox.Item>
        );
    } else {
        return (
            <FilterBox.Item name={CoordinatorFilterConstant[type]} noStyle>
                <Input placeholder="请输入" style={{ width: 250 }} allowClear />
            </FilterBox.Item>
        );
    }
}

function TableList(props: TableListProps) {
    const { tableType } = props;
    const { clubBoardOptions } = usePremitClubBoard();
    const [ clubDeployVersion, setclubDeployVersion ] = useState(get(clubBoardOptions, '0.value'));
    const { hasFunctionPermit } = useContentPermissionFn();
    // 筛选
    const filterers = FilterBox.useFilterBox();
    const currentPaginationRef = useRef(DefaultPagination); // 分页

    const [ sectionOptions, setSectionOptions ] = useState<IdNameOptionsType[]>([]);
    const [ sectionDict, setSectionDict ] = useState<{ [key: string]: SectionResponse[] }>({});

    // 排序
    const [ sorter, setSorter ] = useState({
        orderField: '',
        orderType: '',
    });

    const [ selectedRow, setselectedRow ] = useState<CoordinatorApplyItem[]>([]);
    const rowSelection = useMemo(() => {
        return {
            selectedRowKeys: selectedRow?.map(x => x.id),
            columnWidth: 50,
            onChange: (keys: any, selectedRow: any[]) => {
                setselectedRow(selectedRow);
            },
        };
    }, [ selectedRow ]);

    const tableEl = useRef<HTMLDivElement>(null);

    const getTableHeight = useTableAdaptHeight(tableEl, OMIT_TABLE_HEIGHT);
    // form 表单查询
    const [ initialValues, setInitialValues ] = useState({
        boardId: get(clubBoardOptions, '0.children.0.value'),
        field: COORDINATOR_FILTER.Id,
        userField: COORDINATOR_FILTER.ChannelUserId,
    });

    const [ loading, setLoading ] = useState(false);
    const [ tableData, setTableData ] = useState<{
        data: Array<CoordinatorApplyItem>;
        total: number;
    }>({
        data: [],
        total: 0,
    });

    // 获取栏目
    const fetchSectionList = useCallback(async val => {
        try {
            const { data = [] } = await getSectionByBoard(
                { boardId: val.split(BOARD_PERMIT_SEPARATE)[1] },
                val.split(BOARD_PERMIT_SEPARATE)[0]
            );
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

    const fetchTableData = useCallback(async () => {
        setLoading(true);
        try {
            const {
                field,
                userField,
                boardId: boardIdOrg,
                sectionId: sectionIdOrg,
                createTime,
                auditTime,
                status,
                ...values
            } = await filterers.validate();
            if ([ null, undefined, '' ].includes(boardIdOrg)) {
                message.warn('请选择所属版块');
                return false;
            }
            const [ clubDeployVersion, boardId ] = boardIdOrg.split(BOARD_PERMIT_SEPARATE);

            let sectionId = sectionIdOrg
                ? [ sectionIdOrg, ...(sectionDict[sectionIdOrg]?.map(x => x.id) || []) ].join(',')
                : '';
            let query = {
                ...values,
                boardId: [ boardId ].join(','),
                sectionId,
                status: isEmpty(status)
                    ? tableType === TABLE_TYPE.Record
                        ? [ SIMPLE_AUDIT_STATUS.Pass, SIMPLE_AUDIT_STATUS.Rejected ].join(',')
                        : [ SIMPLE_AUDIT_STATUS.PenddingReview ].join(',')
                    : String(status),
                ...(createTime
                    ? {
                          createTimeStart: setUtcStartTimeAndFormat(createTime[0]),
                          createTimeEnd: setUtcEndTimeAndFormat(createTime[1]),
                      }
                    : {}),
                ...(auditTime
                    ? {
                          auditTimeStart: setUtcStartTimeAndFormat(auditTime[0]),
                          auditTimeEnd: setUtcEndTimeAndFormat(auditTime[1]),
                      }
                    : {}),
                ...sorter,
                ...currentPaginationRef.current,
            };
            const { code, data, total = 0 } = await getCoordinatorApplyList(query, clubDeployVersion);
            if (code === 0 && data) {
                setTableData({
                    data,
                    total,
                });
            } else {
                setTableData({
                    data: [],
                    total: 0,
                });
            }
        } finally {
            setLoading(false);
        }
    }, [ filterers, sectionDict, sorter, tableType ]);

    useReactive(() => {
        fetchTableData();
    });

    useEffect(() => {
        fetchTableData();
    }, [ fetchTableData ]);

    const handleChangeBoardId = useCallback(
        async val => {
            const filter = await filterers.validate();
            fetchSectionList(val);
            setInitialValues({ ...filter, sectionId: null } as any);
            // fetchTableData();
            setclubDeployVersion(val.split(BOARD_PERMIT_SEPARATE)[0]);
        },
        [ fetchSectionList, filterers ]
    );

    const fetchTableDataByFilter = useCallback(() => {
        currentPaginationRef.current = {
            ...currentPaginationRef.current,
            pageIndex: 1,
        };
        fetchTableData();
    }, [ fetchTableData ]);

    // 确认删除
    const handleBatchDelete = useCallback(() => {
        Modal.confirm({
            title: '批量删除',
            content: (
                <div>
                    <p className="port__delete__text">
                        <span>删除</span>
                        <span style={{ color: '#1890ff' }}>{selectedRow.length}</span>
                        <span>个申请吗</span>？
                    </p>
                    <p className="comment_delete_tips">操作不可恢复，请谨慎操作！</p>
                </div>
            ),
            onOk: async () => {
                let query = { boardId: uniq(selectedRow.map(x => x.boardId)).join(',') };
                let data = selectedRow.map(x => x.id);
                const { code, msg } = await removeCoordinatorApply(query, data, clubDeployVersion);
                if (code === 0) {
                    fetchTableData();
                    message.success('删除成功');
                } else {
                    message.error(msg || '异常错误');
                }
            },
            onCancel: () => {},
        });
    }, [ clubDeployVersion, fetchTableData, selectedRow ]);

    const tableTools = useMemo(() => {
        return tableType === TABLE_TYPE.Record ? (
            <Permissions value="btn__del__club_coordinator" name="删除">
                <Button type="primary" onClick={handleBatchDelete} disabled={!selectedRow.length}>
                    批量删除
                </Button>
            </Permissions>
        ) : (
            <Permissions value="btn__examine__club_coordinator" name="审核">
                <Button type="primary" onClick={() => setBatchAuditVisible(true)} disabled={!selectedRow.length}>
                    批量审核
                </Button>
            </Permissions>
        );
    }, [ handleBatchDelete, selectedRow.length, tableType ]);

    const columns: ColumnsType<CoordinatorApplyItem> = useMemo(() => {
        return [
            {
                title: '申请ID',
                dataIndex: 'id',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
                width: TableColumnWidth.index,
            },
            {
                title: '申请备注',
                dataIndex: 'reason',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
                ellipsis: true,
                width: TableColumnWidth.large,
            },
            {
                title: '所属类型',
                dataIndex: 'type',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
                width: TableColumnWidth.small,
                render: (v: AUDIT_POST_TYPE) => AuditPostTypeConstants[v],
            },
            {
                title: '申请操作',
                dataIndex: 'operate',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
                width: TableColumnWidth.normal,
                render: (v: COORDINATOR_OPERATION_STATUS) => PostOperationStatusConstants[v],
            },
            {
                title: '帖子/动态/评论ID',
                dataIndex: 'objectId',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
                width: TableColumnWidth.normal,
            },
            {
                title: '帖子内容/动态内容/评论内容',
                dataIndex: 'objectContent',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
                render: (v, record) => {
                    if (v) {
                        return <PostContent {...({ ...record, content: v } as any)} showOriginImage={false} />;
                    }
                    return '-';
                },
            },
            {
                title: '状态',
                dataIndex: 'status',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
                width: TableColumnWidth.normal,
                render: (v: SIMPLE_AUDIT_STATUS) => (
                    <span style={{ color: SimpleAuditStatusColor[v] }}>{SimpleAuditStatusConstants[v]}</span>
                ),
            },
            {
                title: '所属版块',
                dataIndex: 'boardName',
                switch: 1,
                disabledSwitch: true,
                width: TableColumnWidth.large,
                ellipsis: true,
                align: 'left',
            },
            {
                title: '所属栏目',
                dataIndex: 'sectionName',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
                ellipsis: true,
                width: TableColumnWidth.large,
            },
            {
                title: '申请人昵称',
                dataIndex: 'nickName',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
                width: TableColumnWidth.normal,
            },
            {
                title: '申请人冰川/渠道账号ID',
                dataIndex: 'channelUserId',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
                width: TableColumnWidth.normal,
            },
            {
                title: '申请人通行证名称',
                dataIndex: 'userName',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
                width: TableColumnWidth.normal,
            },
            ...(tableType === TABLE_TYPE.Record
                ? ([
                      {
                          title: '审核人',
                          dataIndex: 'auditBy',
                          switch: 1,
                          disabledSwitch: true,
                          align: 'left',
                          width: TableColumnWidth.normal,
                      },
                      {
                          title: '审核时间',
                          dataIndex: 'auditTime',
                          switch: 1,
                          disabledSwitch: true,
                          align: 'left',
                          width: TableColumnWidth.time,
                          render: (v: string) => {
                              return <DateShortItem formatShort="YYYY-MM-DD HH:mm:ss" date={v} />;
                          },
                      },
                      {
                          title: '审核备注',
                          dataIndex: 'auditReason',
                          switch: 1,
                          disabledSwitch: true,
                          align: 'left',
                          ellipsis: true,
                          width: TableColumnWidth.normal,
                      },
                  ] as ColumnsType<CoordinatorApplyItem>)
                : ([] as ColumnsType<CoordinatorApplyItem>)),
            {
                title: '申请时间',
                dataIndex: 'createTime',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
                width: TableColumnWidth.time,
                sorter: true,
                render: (v: string) => {
                    return <DateShortItem formatShort="YYYY-MM-DD HH:mm:ss" date={v} />;
                },
            },
        ];
    }, [ tableType ]);

    const handleChange = useCallback(
        (nextPagination: any, filters: any, sorter: any) => {
            currentPaginationRef.current = {
                pageIndex: nextPagination.current,
                pageSize: nextPagination.pageSize || DefaultPagination.pageSize,
            };
            if (sorter?.['field'] && sorter?.['order']) {
                const { field, order } = sorter;
                setSorter({
                    orderField: field,
                    orderType: order === 'ascend' ? 'asc' : 'desc',
                });
            }
            fetchTableData();
        },
        [ fetchTableData ]
    );

    // 批量审核相关
    const [ batchAuditVisible, setBatchAuditVisible ] = useState(false);
    const [ batchAuditForm ] = Form.useForm();
    const [ batchAuditLoading, setBatchAuditLoading ] = useState(false);

    const handleBatchAuditConfirm = async () => {
        const values = await batchAuditForm.validateFields();
        const submitData = {
            ...values,
            ids: selectedRow.map(x => x.id),
        };
        setBatchAuditLoading(true);
        try {
            let query = { boardId: uniq(selectedRow.map(x => x.boardId)).join(',') };
            const res = await auditCoordinatorApply(query, submitData, clubDeployVersion);
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

    const download = useCallback(async () => {
        const {
            field,
            userField,
            boardId: boardIdOrg,
            sectionId: sectionIdOrg,
            createTime,
            auditTime,
            status,
            ...values
        } = await filterers.validate();
        if ([ null, undefined, '' ].includes(boardIdOrg)) {
            message.warn('请选择所属版块');
            return false;
        }
        const [ clubDeployVersion, boardId ] = boardIdOrg.split(BOARD_PERMIT_SEPARATE);

        let sectionId = sectionIdOrg
            ? [ sectionIdOrg, ...(sectionDict[sectionIdOrg]?.map(x => x.id) || []) ].join(',')
            : '';
        let query = {
            ...values,
            boardId: [ boardId ].join(','),
            sectionId,
            status: isEmpty(status)
                ? tableType === TABLE_TYPE.Record
                    ? [ SIMPLE_AUDIT_STATUS.Pass, SIMPLE_AUDIT_STATUS.Rejected ].join(',')
                    : [ SIMPLE_AUDIT_STATUS.PenddingReview ].join(',')
                : String(status),
            ...(createTime
                ? {
                      createTimeStart: setUtcStartTimeAndFormat(createTime[0]),
                      createTimeEnd: setUtcEndTimeAndFormat(createTime[1]),
                  }
                : {}),
            ...(auditTime
                ? {
                      auditTimeStart: setUtcStartTimeAndFormat(auditTime[0]),
                      auditTimeEnd: setUtcEndTimeAndFormat(auditTime[1]),
                  }
                : {}),
            ...sorter,
            pageIndex: 1,
            pageSize: DOWNLOAD_PAGESIZE,
        };
        await downloadCoordinatorApplyList(query, clubDeployVersion);
    }, [ filterers, sectionDict, sorter, tableType ]);

    const tableProps = useMemo(() => {
        return {
            columns,
            dataSource: tableData.data,
            rowKey: 'id',
            tableName: `operation@page__list__club_coordinator_post@${tableType}`,
            loading,
            tableTools,
            download: tableType === TABLE_TYPE.Record && hasFunctionPermit('btn__down__club_coordinator') && download,
            scrollToFirstRowOnChange: true,
            pagination: {
                showSizeChanger: true,
                current: currentPaginationRef.current.pageIndex,
                pageSize: currentPaginationRef.current.pageSize,
                total: tableData.total,
                showTotal: () => `共${tableData.total}条`,
            },
            onChange: handleChange,
            rowSelection: {
                type: 'checkbox' as RowSelectionType,
                ...rowSelection,
            },
            scroll: { y: getTableHeight, x: 1920 },
        };
    }, [
        columns,
        download,
        getTableHeight,
        handleChange,
        hasFunctionPermit,
        loading,
        rowSelection,
        tableData.data,
        tableData.total,
        tableTools,
        tableType,
    ]);

    return (
        <>
            <FilterBox
                context={filterers}
                query={fetchTableDataByFilter}
                tableName="clubPostTable"
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
                        className="club-post-section-treeSelect"
                        treeData={sectionOptions}
                        onChange={fetchTableData}
                    />
                </FilterBox.Item>
                {tableType === TABLE_TYPE.Record && (
                    <FilterBox.Item name="status" label="审核状态">
                        <Select options={SimpleAuditStatusOptions} allowClear></Select>
                    </FilterBox.Item>
                )}
                <FilterBox.Item name="type" label="所属类型">
                    <Select options={AuditPostTypeOptions} allowClear></Select>
                </FilterBox.Item>
                <FilterBox.Item name="operate" label="申请操作">
                    <Select options={PostOperationStatusOptions} allowClear></Select>
                </FilterBox.Item>
                <FilterBox.Item
                    className="filterbox-compact-model"
                    type="compactNormal"
                    style={{ whiteSpace: 'nowrap' }}
                >
                    <Input.Group compact>
                        <FilterBox.Item name="field" noStyle>
                            <Select options={CoordinatorFilterOptions} />
                        </FilterBox.Item>
                        <FilterBox.Item noStyle shouldUpdate={(prev, next) => prev.field !== next.field}>
                            {({ getFieldValue }) => transformFilterItemCom(getFieldValue('field'))}
                        </FilterBox.Item>
                    </Input.Group>
                </FilterBox.Item>
                <FilterBox.Item
                    className="filterbox-compact-model"
                    type="compactNormal"
                    style={{ whiteSpace: 'nowrap' }}
                >
                    <Input.Group compact>
                        <FilterBox.Item name="userField" noStyle>
                            <Select options={CoordinatorUserFilterOptions} />
                        </FilterBox.Item>
                        <FilterBox.Item noStyle shouldUpdate={(prev, next) => prev.userField !== next.userField}>
                            {({ getFieldValue }) => transformFilterItemCom(getFieldValue('userField'))}
                        </FilterBox.Item>
                    </Input.Group>
                </FilterBox.Item>
                {tableType === TABLE_TYPE.Record && (
                    <FilterBox.Item name="createTime" label="申请时间">
                        <RangePicker allowClear ranges={quickPickTimeRange} inputReadOnly />
                    </FilterBox.Item>
                )}
                {tableType === TABLE_TYPE.Record && (
                    <FilterBox.Item name="auditTime" label="审核时间">
                        <RangePicker allowClear ranges={quickPickTimeRange} inputReadOnly />
                    </FilterBox.Item>
                )}
            </FilterBox>
            <div ref={tableEl}>
                <Q1Table {...tableProps} />
            </div>
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
                                <Radio value={SIMPLE_AUDIT_STATUS.Pass}>全部通过</Radio>
                                <Radio value={SIMPLE_AUDIT_STATUS.Rejected}>全部拒绝</Radio>
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
        </>
    );
}

export default inject('UIState', 'Permit', 'GameContext', 'User', 'Club')(observer(TableList));
