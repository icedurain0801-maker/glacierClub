import React, { useState, useEffect, useRef, useCallback, useMemo, useImperativeHandle } from 'react';
import { FilterBox, Q1Table, ColumnsType } from 'q1-antd';
import { Input, Select, Image, InputNumber, Tag, Popover, Tabs, Button, Descriptions, Drawer } from 'antd';
import type { SorterResult, TableRowSelection } from 'antd/es/table/interface';
import moment from 'moment';
import { get } from 'lodash';
import { inject, observer } from 'mobx-react';

import Permissions from '@/layouts/components/permissions';
import { useContentDialogContainer, useContentPermissionFn, useContentTabSearch, useReactive } from '@/context';
import { getComplaintRecord, getComplaintRecordHref } from '@/api/club';
import { quickPickTimeRange, simpleTime } from '@/utils/date';
import useSyncState from '@/hooks/state/useSyncState';
import RangePicker from '@/components/RangePicker';
import { usePersistantFunction } from '@/hooks/state/useLatestValueRef';
import { StoreType } from '@/store/config';

import {
    USER_LOG_TYPE,
    ComplaintRecordFilterOptions,
    ComplaintRecordFilterConstants,
    COMPLAINT_FILTER,
    ComplaintOptions,
    ComplaintRecordResponse,
    ComplaintType,
    ComplaintRecordImage,
    ComplaintConstants,
    BOARD_PERMIT_SEPARATE,
    COMPLAINT_SOURCE,
    ComplaintSourceConstants,
    TABLE_TYPE,
    TableTypeValues,
    COMPLAINT_AUDIT_STATUS,
    ComplaintAuditConstants,
    ACTIVE_SOURCE,
    MOMENT_TYPE,
} from '@ts/club';
import { TableColumnWidth } from '@ts/app';

import { usePremitClubBoard } from '../../board/hooks/useClubBoardOptions';
import ClubLoaded from '../../components/ClubLoaded';
import Audit from './Audit';
import PostEdit from '../../content/components/PostEdit';
import PostContent from '../../content/components/PostContent';

require('./index.less');

interface ComplaintTabListProps {}

interface ComplaintTabListPropsMobx extends ComplaintTabListProps, Pick<StoreType, 'UIState'> {}

interface ComplaintRecordListProps {
    tableType: TABLE_TYPE;
}

interface RefMethods {
    fetchTableData: () => void;
}

const transformCommentFilterItemCom = function transformCommentFilterItemCom(type: COMPLAINT_FILTER) {
    return (
        <FilterBox.Item name={ComplaintRecordFilterConstants[type]} noStyle>
            {[ COMPLAINT_FILTER.ID ].includes(type) ? (
                <InputNumber placeholder="请输入" style={{ width: 190 }} />
            ) : (
                <Input placeholder="请输入" style={{ width: 250 }} allowClear />
            )}
        </FilterBox.Item>
    );
};

// 定义辅助函数，将字符串转换为大驼峰形式
function toPascalCase(str: string): string {
    return str.replace(/[-_]([a-z])/g, (_, char) => char.toUpperCase()).replace(/^[a-z]/, char => char.toUpperCase());
}

// 定义辅助函数，将对象的键转换为大驼峰形式
function convertKeysToPascalCase(obj: Record<string, any>): Record<string, any> {
    const newObj: Record<string, any> = {};
    for (const [ key, value ] of Object.entries(obj)) {
        const newKey = toPascalCase(key);
        if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
                newObj[newKey] = value.map(item => (typeof item === 'object' ? convertKeysToPascalCase(item) : item));
            } else {
                newObj[newKey] = convertKeysToPascalCase(value);
            }
        } else {
            newObj[newKey] = value;
        }
    }
    return newObj;
}

// 定义辅助函数，将数组对象的所有键转换为大驼峰形式
function convertArrayKeysToPascalCase(arr: Record<string, any>[]): Record<string, any>[] {
    return arr.map(obj => convertKeysToPascalCase(obj));
}

const ComplaintRecordList = React.forwardRef<RefMethods, ComplaintRecordListProps>((props, ref) => {
    const { tableType } = props;
    const { hasFunctionPermit } = useContentPermissionFn();
    const filterbox = FilterBox.useFilterBox();

    // 表单数据源
    const [ data, setData ] = useState<ComplaintRecordResponse[]>([]);
    const [ loading, setLoading ] = useState(false);
    const previousBoradId = useRef<string>(); // 记录上一次的BoradId

    // 分页
    const [ pagination, setpagination, getPagination ] = useSyncState({
        current: 1,
        total: 0,
        pageSize: 10,
    });
    // 排序字段
    const sortedInfo = useRef<SorterResult<any>>({});

    const { clubBoardOptions } = usePremitClubBoard();
    const [ clubDeployVersion, setclubDeployVersion ] = useState(get(clubBoardOptions, '0.value'));

    const [ initialValues, setInitialValues ] = useState({
        boardId: get(clubBoardOptions, '0.children.0.value'),
        complaintFilterType: COMPLAINT_FILTER.ID,
    });

    // 获取表格数据;
    const { fetchTableData } = usePersistantFunction({
        fetchTableData: async () => {
            setLoading(true);
            try {
                const {
                    boardId,
                    complaintFilterType,
                    field,
                    value,
                    status,
                    actionTime,
                    ...rest
                } = await filterbox.validate();
                const { pageSize, current } = getPagination();
                let params = {
                    pageSize,
                    pageIndex: current,
                    ...rest,
                    boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1],
                    ...(value ? { [field]: value } : {}),
                    ...(sortedInfo.current.order
                        ? {
                              order:
                                  sortedInfo.current.order === 'ascend'
                                      ? `${sortedInfo.current.field} asc`
                                      : `${sortedInfo.current.field} desc`,
                          }
                        : {}),
                    ...(actionTime && actionTime.length > 0
                        ? {
                              startTime: moment(actionTime[0]).startOf('day').valueOf(),
                              endTime: moment(actionTime[1]).endOf('day').valueOf(),
                          }
                        : {}),
                    auditResult:
                        tableType === TABLE_TYPE.Record
                            ? [ COMPLAINT_AUDIT_STATUS.Success, COMPLAINT_AUDIT_STATUS.Fail ].join(',')
                            : [ COMPLAINT_AUDIT_STATUS.OnAudit ].join(','),
                };
                const { data = [], total } = await getComplaintRecord(params, clubDeployVersion);
                if ((data || [])?.length === 0 && current !== 1) {
                    setpagination({ ...getPagination(), current: 1 });
                    fetchTableData();
                }
                setData(data || []);
                setpagination({ ...getPagination(), total: total || 0 });
            } finally {
                setLoading(false);
            }
        },
    });

    useImperativeHandle(ref, () => ({
        fetchTableData,
    }));

    const handleFormChange = useCallback(
        async val => {
            let { boardId, sectionId, ...ret } = await filterbox.validate();
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
        [ fetchTableData, filterbox ]
    );

    useEffect(() => {
        fetchTableData();
    }, [ fetchTableData ]);

    const handleChange = useCallback(
        (nextPagination: any, _filters, sorter: any) => {
            setpagination({ ...pagination, ...nextPagination });
            sortedInfo.current = sorter;
            fetchTableData();
        },
        [ fetchTableData, pagination, setpagination ]
    );

    // 来源详情
    const [ sourceDetail, setSourceDetail ] = useState<{
        visible: boolean;
        data: ComplaintRecordResponse;
    }>({
        visible: false,
        data: {} as ComplaintRecordResponse,
    });

    const columns: ColumnsType<ComplaintRecordResponse> = useMemo(() => {
        return [
            {
                dataIndex: 'id',
                title: '序号',
                switch: 1,
                align: 'center',
                width: 80,
            },
            {
                dataIndex: 'nickname',
                title: '举报人昵称',
                switch: 1,
                align: 'center',
                width: 140,
            },
            {
                dataIndex: 'channelUserId',
                title: '举报人冰川/渠道账号ID',
                switch: 1,
                align: 'center',
                width: 140,
            },
            {
                dataIndex: 'userName',
                title: '举报人冰川通行证名称',
                switch: 1,
                align: 'center',
                width: 140,
            },
            {
                dataIndex: 'type',
                title: '举报原因',
                switch: 1,
                align: 'center',
                width: 270,
                render: (v: ComplaintType) => {
                    return <Tag color="blue">{ComplaintConstants[v]}</Tag>;
                },
            },
            {
                dataIndex: 'fromNickName',
                title: '被举报人昵称',
                switch: 1,
                align: 'center',
                width: 140,
            },
            {
                dataIndex: 'fromChannelUserId',
                title: '被举报人冰川/渠道账号ID',
                switch: 1,
                align: 'center',
                width: 140,
            },
            {
                dataIndex: 'fromUserName',
                title: '被举报人冰川通行证名称',
                switch: 1,
                align: 'center',
                width: 150,
            },
            {
                dataIndex: 'source',
                title: '举报来源',
                switch: 1,
                align: 'center',
                width: TableColumnWidth.normal,
                render: (v: COMPLAINT_SOURCE, record) => {
                    const isActiveSource = ACTIVE_SOURCE.includes(v);
                    return (
                        <span
                            className={isActiveSource ? 'q1-link' : ''}
                            onClick={() => {
                                if (isActiveSource) {
                                    setSourceDetail({
                                        visible: true,
                                        data: record,
                                    });
                                }
                            }}
                        >
                            {ComplaintSourceConstants[v]}
                        </span>
                    );
                },
            },
            {
                dataIndex: 'description',
                title: '举报描述',
                switch: 1,
                align: 'center',
                render: (desc: string) => {
                    const textSplit = desc?.length >= 99;
                    return (
                        <div>
                            {textSplit && desc ? (
                                <Popover
                                    content={
                                        <div style={{ maxWidth: '40vw', maxHeight: '60vh', overflow: 'auto' }}>
                                            {desc}
                                        </div>
                                    }
                                >
                                    <div>{String(desc.substring(0, 50)) + '...'}</div>
                                </Popover>
                            ) : (
                                <div>{desc}</div>
                            )}
                        </div>
                    );
                },
            },
            {
                title: '图片上传',
                dataIndex: 'image',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
                width: 250,
                render: (image: ComplaintRecordImage[]) => {
                    return (image || []).map((v, idx) => {
                        return <Image src={v.src} className="complaint__record__image" key={idx}></Image>;
                    });
                },
            },
            {
                title: '举报时间',
                dataIndex: 'createTime',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
                render: (v: string) => {
                    return <span>{v ? simpleTime(v) : v}</span>;
                },
                width: TableColumnWidth.time,
            },
            ...(tableType === TABLE_TYPE.Record
                ? ([
                      {
                          title: '处理结果',
                          dataIndex: 'auditResult',
                          switch: 1,
                          width: TableColumnWidth.normal,
                          render: (v: COMPLAINT_AUDIT_STATUS) => {
                              return (
                                  <span className={v === COMPLAINT_AUDIT_STATUS.Success ? 'color-green' : 'color-red'}>
                                      {ComplaintAuditConstants[v]}
                                  </span>
                              );
                          },
                      },
                      {
                          title: '备注内容',
                          dataIndex: 'remark',
                          switch: 1,
                          ellipsis: true,
                          width: TableColumnWidth.huge,
                      },
                      {
                          title: '审核人',
                          dataIndex: 'auditName',
                          switch: 1,
                          align: 'left',
                          width: TableColumnWidth.normal,
                      },
                      {
                          title: '审核时间',
                          dataIndex: 'auditTime',
                          switch: 1,
                          align: 'left',
                          width: TableColumnWidth.time,
                          render: (v: string) => {
                              return <span>{v ? simpleTime(v) : v}</span>;
                          },
                      },
                  ] as ColumnsType<ComplaintRecordResponse>)
                : []),
        ];
    }, [ tableType ]);

    // 多选配置
    const [ selectedRows, setselectedRow ] = useState<ComplaintRecordResponse[]>([]);

    const rowSelection: TableRowSelection<ComplaintRecordResponse> | undefined = useMemo(() => {
        return tableType === TABLE_TYPE.Record
            ? undefined
            : {
                  type: 'checkbox',
                  selectedRowKeys: selectedRows.map(x => x.id),
                  columnWidth: 50,
                  onChange: (key: React.Key[], selectedRow: ComplaintRecordResponse[]) => {
                      setselectedRow(selectedRow);
                  },
              };
    }, [ selectedRows, tableType ]);

    const [ visibleAuditModal, setVisibleAuditModal ] = useState(false);

    const title = useMemo(() => {
        if (tableType === TABLE_TYPE.Audit) {
            return (
                <>
                    <Permissions value="btn__update__club_log_status">
                        <Button
                            type="primary"
                            onClick={() => {
                                setVisibleAuditModal(true);
                            }}
                            disabled={selectedRows?.length ? false : true}
                        >
                            批量处理
                        </Button>
                    </Permissions>
                </>
            );
        }
        return undefined;
    }, [ selectedRows?.length, tableType ]);

    // 导出
    const download = useCallback(async () => {
        const { boardId, complaintFilterType, field, value, status, actionTime, ...rest } = await filterbox.validate();
        const params = {
            objectType: USER_LOG_TYPE.Avatar,
            pageSize: 10e4,
            pageIndex: 1,
            ...rest,
            boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1],
            ...(value ? { [field]: value } : {}),
            ...(sortedInfo.current.field
                ? {
                      order:
                          sortedInfo.current.order === 'ascend'
                              ? `${sortedInfo.current.field} asc`
                              : `${sortedInfo.current.field} desc`,
                  }
                : {}),
            ...(actionTime && actionTime.length > 0
                ? {
                      startTime: moment(actionTime[0]).valueOf(),
                      endTime: moment(actionTime[1]).valueOf(),
                  }
                : {}),
            auditResult:
                tableType === TABLE_TYPE.Record
                    ? [ COMPLAINT_AUDIT_STATUS.Success, COMPLAINT_AUDIT_STATUS.Fail ].join(',')
                    : [ COMPLAINT_AUDIT_STATUS.OnAudit ].join(','),
        };
        await getComplaintRecordHref({ ...params, clubDeployVersion: clubDeployVersion! });
    }, [ clubDeployVersion, filterbox, tableType ]);

    const renderCommentNode = useMemo(() => {
        const comment = get(sourceDetail.data, 'content.comment');
        return comment ? (
            <PostContent
                {...{
                    ...(sourceDetail.data.content as any),
                    content: JSON.stringify(convertArrayKeysToPascalCase(comment)),
                }}
                showOriginImage={true}
            />
        ) : (
            '-'
        );
    }, [ sourceDetail.data ]);

    const isCommentSource = useMemo(() => {
        return get(sourceDetail.data, 'source') === COMPLAINT_SOURCE.Comment;
    }, [ sourceDetail.data ]);

    return (
        <div className="complaint-record-list">
            <FilterBox
                query={fetchTableData}
                tableName="clubUserTable"
                context={filterbox}
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
                <FilterBox.Item className="filterbox-compact-model filterbox-compact-model-flex" type="compactNormal">
                    <Input.Group compact>
                        <FilterBox.Item name="complaintFilterType" noStyle>
                            <Select options={ComplaintRecordFilterOptions} />
                        </FilterBox.Item>
                        <FilterBox.Item
                            noStyle
                            shouldUpdate={(prev, next) => prev.complaintFilterType !== next.complaintFilterType}
                        >
                            {({ getFieldValue }) => transformCommentFilterItemCom(getFieldValue('complaintFilterType'))}
                        </FilterBox.Item>
                    </Input.Group>
                </FilterBox.Item>
                <FilterBox.Item name="type" label="举报原因">
                    <Select options={ComplaintOptions} allowClear placeholder="不限" />
                </FilterBox.Item>
                <FilterBox.Item name="actionTime" label="举报时间">
                    <RangePicker ranges={quickPickTimeRange} />
                </FilterBox.Item>
            </FilterBox>
            <Q1Table
                key="clubUserAvatarTable"
                rowKey="id"
                tableName="operation@page__list__club_log_report"
                download={hasFunctionPermit('btn__down__complaint_record') && download}
                loading={loading}
                columns={columns}
                dataSource={data}
                pagination={{
                    showSizeChanger: true,
                    showQuickJumper: true,
                    ...pagination,
                    showTotal: () => `共${pagination.total}条`,
                }}
                rowSelection={tableType === TABLE_TYPE.Audit ? rowSelection : undefined}
                scroll={{ x: 1900 }}
                onChange={handleChange}
                tableTools={title}
            />
            <Audit
                boardId={(initialValues.boardId ?? '').split(BOARD_PERMIT_SEPARATE)[1]}
                clubDeployVersion={clubDeployVersion}
                data={selectedRows}
                visible={visibleAuditModal}
                onOk={() => {
                    setVisibleAuditModal(false);
                    setselectedRow([]);
                    fetchTableData();
                }}
                onCancel={() => {
                    setVisibleAuditModal(false);
                }}
            />
            <Drawer
                getContainer={useContentDialogContainer()}
                title="来源详情"
                visible={sourceDetail.visible}
                width={580}
                onClose={() => {
                    setSourceDetail({
                        visible: false,
                        data: {} as ComplaintRecordResponse,
                    });
                }}
                className="post-detail detail-drawer-wrap"
            >
                <Descriptions bordered column={1} labelStyle={{ width: '4em' }}>
                    <Descriptions.Item label="帖文ID">
                        {get(sourceDetail.data, 'content.postId', '-')}
                    </Descriptions.Item>
                    <Descriptions.Item label="帖文标题">
                        {get(sourceDetail.data, 'content.title', '-')}
                    </Descriptions.Item>
                    <Descriptions.Item label="帖文内容">
                        {sourceDetail.visible && (
                            <div className="content-wrap">
                                {initialValues.boardId ? (
                                    <PostEdit
                                        type="detail"
                                        data={{
                                            boardId: (initialValues.boardId ?? '').split(BOARD_PERMIT_SEPARATE)[1],
                                            id: get(sourceDetail.data, 'content.postId', '-'),
                                            type: MOMENT_TYPE.Post,
                                        }}
                                        visibleDrawer={false}
                                        clubDeployVersion={clubDeployVersion}
                                    />
                                ) : null}
                            </div>
                        )}
                    </Descriptions.Item>
                    {isCommentSource ? (
                        <Descriptions.Item label="评论ID">
                            {get(sourceDetail.data, 'content.commentId', '-')}
                        </Descriptions.Item>
                    ) : null}
                    {isCommentSource ? (
                        <Descriptions.Item label="评论内容">{renderCommentNode}</Descriptions.Item>
                    ) : null}
                </Descriptions>
            </Drawer>
        </div>
    );
});

function ComplaintTabList(props: ComplaintTabListProps) {
    const { UIState } = props as ComplaintTabListPropsMobx;
    // 初始tabPane
    const [ activeKey, setActiveKey ] = useState<TABLE_TYPE>(TABLE_TYPE.Audit);

    const auditRef = React.useRef<any>();
    const recordRef = React.useRef<any>();

    const urlTableType = (useContentTabSearch().get('tableType') || '') as TABLE_TYPE;

    useEffect(() => {
        TableTypeValues.includes(urlTableType) && setActiveKey(urlTableType);
    }, [ urlTableType ]);

    useReactive(() => {
        if (TableTypeValues.includes(urlTableType)) {
            setActiveKey(urlTableType);
            if (urlTableType === TABLE_TYPE.Record) {
                recordRef.current?.fetchTableData();
            } else {
                auditRef.current?.fetchTableData();
            }
        }
    });

    const handleTabClick = useCallback(
        (key: string) => {
            setActiveKey(key as TABLE_TYPE);
            UIState.gotoTab({
                pathname: `/report`,
                search: `?tableType=${key}`,
            });
            setTimeout(() => {
                if (key === TABLE_TYPE.Record) {
                    recordRef.current?.fetchTableData();
                } else {
                    auditRef.current?.fetchTableData();
                }
            }, 10);
        },
        [ UIState ]
    );

    return (
        <>
            <Tabs activeKey={activeKey} className="page-content-tabbox" onTabClick={handleTabClick} animated={false}>
                <Tabs.TabPane tab="待处理列表" key={TABLE_TYPE.Audit}>
                    <ComplaintRecordList key={TABLE_TYPE.Audit} tableType={TABLE_TYPE.Audit} ref={auditRef} />
                </Tabs.TabPane>
                <Tabs.TabPane tab="举报列表" key={TABLE_TYPE.Record}>
                    <ComplaintRecordList key={TABLE_TYPE.Record} tableType={TABLE_TYPE.Record} ref={recordRef} />
                </Tabs.TabPane>
            </Tabs>
        </>
    );
}

const ComplaintTabxListMobx = inject('UIState')(observer(ComplaintTabList));

function ComplaintTabListAdvanced() {
    return (
        <ClubLoaded>
            <ComplaintTabxListMobx />
        </ClubLoaded>
    );
}

export default ComplaintTabListAdvanced;
