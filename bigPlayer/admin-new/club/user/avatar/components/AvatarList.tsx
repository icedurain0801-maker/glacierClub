import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FilterBox, Q1Table, ColumnsType } from 'q1-antd';
import { Input, Select, Image as AntdImage, Button, Popover, Modal, Image, message } from 'antd';
import type { SorterResult, TableRowSelection } from 'antd/es/table/interface';
import moment from 'moment';
import { get, omit } from 'lodash';
import { v4 as uuidv4 } from 'uuid';

import Permissions from '@/layouts/components/permissions';
import { useContentDialogContainer, useContentPermissionFn } from '@/context';
import { getUserAuditLog, getUserAuditLogHref, userAuditCancel, userMachineAudit } from '@/api/club';
import { quickPickTimeRange, setUtcEndTimeAndFormat, setUtcStartTimeAndFormat, simpleTime } from '@/utils/date';
import useSyncState from '@/hooks/state/useSyncState';
import RangePicker from '@/components/RangePicker';
import { TABLE_TYPE } from '@/pages/club/content/post/list';
import { usePersistantFunction } from '@/hooks/state/useLatestValueRef';

import {
    AvatarListType,
    ActiveKeyType,
    SimpleOptionType,
    AuditStatusConstant,
    USER_LOG_TYPE,
    AUDIT_STATUS,
    UesrNickNameOptionsData,
    AvatarRecordFilterOptionsData,
    ClubDeployVersionOptionsData,
    MAX_MACHINE_AUDIT_NUMS,
} from '@ts/club';

import AvatarAudit from './AvatarAudit';

interface AvatarListProps {
    activeKey: ActiveKeyType;
    clubBoard: number;
    statusOptions: SimpleOptionType[];
}
interface UserListPropsMobx extends AvatarListProps {}
function AvatarList(props: AvatarListProps) {
    const { activeKey, statusOptions, clubBoard } = props as UserListPropsMobx;
    const { hasFunctionPermit } = useContentPermissionFn();
    const filterbox = FilterBox.useFilterBox();

    // 表单数据源
    const [ data, setData ] = useState<AvatarListType[]>([]);
    const [ loading, setLoading ] = useState(false);
    const [ clubDeployVersion, setclubDeployVersion ] = useState(get(ClubDeployVersionOptionsData, '0.value'));

    const [ visibleAuditModal, setVisibleAuditModal ] = useState(false);
    const [ selectedRow, setselectedRow ] = useState<AvatarListType[]>([]);

    // form 表单查询
    let initVal = useMemo(() => {
        return { field: 'userId', clubDeployVersion: get(ClubDeployVersionOptionsData, '0.value') };
    }, []);

    // 分页
    const [ pagination, setpagination, getPagination ] = useSyncState({
        current: 1,
        total: 0,
        pageSize: 10,
    });
    // 排序字段
    const sortedInfo = useRef<SorterResult<any>>({});

    // 获取表格数据
    const { fetchTableData } = usePersistantFunction({
        fetchTableData: async () => {
            setLoading(true);
            try {
                const { clubDeployVersion, field, value, status, auditTime, ...rest } = await filterbox.validate();
                const { pageSize, current } = getPagination();

                let params = {
                    objectType: USER_LOG_TYPE.Avatar,
                    pageSize,
                    pageIndex: current,
                    status: status || status === 0 ? [ status ] : statusOptions.map(x => x?.value),
                    auditStartTime: auditTime ? setUtcStartTimeAndFormat(auditTime[0]) : null,
                    auditEndTime: auditTime ? setUtcEndTimeAndFormat(auditTime[1]) : null,
                    ...rest,
                    ...(value ? { [field]: value } : {}),
                    ...(sortedInfo.current.field
                        ? {
                              sortField: sortedInfo.current.field,
                              sortOrder: sortedInfo.current.order === 'ascend' ? 'asc' : 'desc',
                          }
                        : {}),
                };
                const { data = [], total } = await getUserAuditLog({ boardId: clubBoard }, params, clubDeployVersion);
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

    // 模拟获取数据
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

    const getContainer = useContentDialogContainer();
    /** 作废 */
    const handleCancel = useCallback(
        (record: AvatarListType) => {
            Modal.confirm({
                getContainer,
                title: `系统提示`,
                content: (
                    <div>
                        <span>确定将冰川通行证名称</span>【{record?.userName}】<span>头像作废</span>？
                        <br />
                        <p style={{ color: '#999' }}>作废后将返回上一次审核通过的头像。</p>
                        <br />
                        <Image src={record?.avatar} style={{ maxWidth: '230px', maxHeight: '160px' }} />
                    </div>
                ),
                onOk: async () => {
                    const { code, msg } = await userAuditCancel(
                        { boardId: String(clubBoard) }, // String(record?.boardId) },
                        [ record?.id ],
                        'avatar',
                        clubDeployVersion
                    );
                    if (code === 0) {
                        message.success(msg);
                        fetchTableData();
                    } else {
                        message.error(msg);
                    }
                },
                onCancel: () => {},
            });
        },
        [ clubBoard, clubDeployVersion, fetchTableData, getContainer ]
    );

    const columns: ColumnsType<AvatarListType> = useMemo(() => {
        let recodeColumns: ColumnsType<AvatarListType> = [
            {
                dataIndex: 'auditBy',
                title: '审核人',
                switch: 1,
                align: 'center',
            },
            {
                dataIndex: 'auditTime',
                title: '审核时间',
                switch: 1,
                align: 'center',
                render: (v?: string) => simpleTime(v || ''),
            },
        ];
        let operationColumns: ColumnsType<AvatarListType> = [
            {
                dataIndex: 'operation',
                title: '操作',
                switch: 1,
                align: 'center',
                disabledSwitch: true,
                resizable: false,
                width: 66,
                render: (v, record) => (
                    <Button
                        disabled={record?.status !== AUDIT_STATUS.Passed}
                        type="link"
                        style={{ padding: '2px' }}
                        onClick={() => {
                            handleCancel(record);
                        }}
                    >
                        作废
                    </Button>
                ),
            },
        ];
        return [
            {
                dataIndex: 'id',
                title: '头像ID',
                switch: 1,
                align: 'center',
            },
            {
                dataIndex: 'avatar',
                title: '头像',
                switch: 1,
                align: 'center',
                render: v => {
                    return v ? (
                        <Popover
                            placement="right"
                            content={<AntdImage src={v} style={{ maxHeight: '360px', width: 'auto' }} />}
                        >
                            <AntdImage src={v} style={{ maxHeight: '60px', width: 'auto' }} />
                        </Popover>
                    ) : (
                        ''
                    );
                },
            },
            {
                dataIndex: 'status',
                title: '头像状态',
                switch: 1,
                align: 'center',
                render: (v: keyof typeof AuditStatusConstant) => AuditStatusConstant[v] || '',
            },
            {
                dataIndex: 'nickName',
                title: '昵称',
                switch: 1,
                align: 'center',
            },
            {
                dataIndex: 'channelUserId',
                title: '冰川/渠道账号ID',
                switch: 1,
                align: 'center',
            },
            {
                dataIndex: 'userName',
                title: '冰川通行证名称',
                switch: 1,
                align: 'center',
            },
            {
                dataIndex: 'operationTime',
                title: '上传时间',
                switch: 1,
                align: 'center',
                sorter: true,
                render: v => simpleTime(v || ''),
            },
            ...(activeKey === 'record' ? recodeColumns : []),
            {
                title: '备注',
                dataIndex: 'remark',
                switch: 1,
                disabledSwitch: true,
                ellipsis: true,
                align: 'left',
            },
            ...(activeKey === 'record' ? operationColumns : []),
        ];
    }, [ activeKey, handleCancel ]);

    const getUuid = () => uuidv4();

    // 批量机审
    const [ machineAuditLoading, setMachineAuditLoading ] = useState(false);
    const handleMachineAudit = useCallback(async () => {
        if (selectedRow.length > MAX_MACHINE_AUDIT_NUMS) {
            message.error(`批量审核条数不能大于${MAX_MACHINE_AUDIT_NUMS}条！`);
            return;
        }
        setMachineAuditLoading(true);
        try {
            const { code, msg } = await userMachineAudit(
                { boardId: String(clubBoard), type: 0, code: getUuid() },
                { ids: selectedRow?.map(x => x.id) },
                'avatar',
                clubDeployVersion
            );
            if (code === 0) {
                message.success(msg || '批量机审通过');
                setselectedRow([]);
                fetchTableData();
            } else {
                message.error(msg);
            }
        } finally {
            setMachineAuditLoading(false);
        }
    }, [ clubBoard, clubDeployVersion, fetchTableData, selectedRow ]);

    const headerTop = activeKey === 'audit' && (
        <>
            <Permissions value="btn__update__club_avatar_audit">
                <Button
                    type="primary"
                    onClick={handleMachineAudit}
                    disabled={selectedRow?.length ? false : true}
                    loading={machineAuditLoading}
                >
                    批量机审
                </Button>
            </Permissions>
            <Permissions value="btn__update__club_avatar_audit">
                <Button
                    type="primary"
                    onClick={() => {
                        setVisibleAuditModal(true);
                    }}
                    disabled={selectedRow?.length ? false : true}
                >
                    批量人工复审
                </Button>
            </Permissions>
        </>
    );
    const AuditTimePicker = useMemo(() => {
        if (activeKey === TABLE_TYPE.Record) {
            return (
                <>
                    <FilterBox.Item name="auditTime" label="审核时间">
                        <RangePicker allowClear ranges={quickPickTimeRange} inputReadOnly />
                    </FilterBox.Item>
                </>
            );
        }
    }, [ activeKey ]);

    const rowSelection: TableRowSelection<AvatarListType> | undefined = useMemo(() => {
        return activeKey === 'audit'
            ? {
                  selectedRowKeys: selectedRow?.map(x => x.id),
                  columnWidth: 50,
                  onChange: (keys: any, selectedRow) => {
                      setselectedRow(selectedRow || []);
                  },
              }
            : undefined;
    }, [ activeKey, selectedRow ]);
    const filterSelectionData = useMemo(() => {
        return activeKey === 'audit' ? UesrNickNameOptionsData : AvatarRecordFilterOptionsData;
    }, [ activeKey ]);
    useEffect(() => {
        if (statusOptions) {
            fetchTableData();
        }
    }, [ fetchTableData, statusOptions ]);
    // 导出
    const download = useCallback(async () => {
        const { field, value, status, auditTime, ...rest } = await filterbox.validate();
        const isSearchLastWeek = Object.values(omit(await filterbox.validate(), 'field')).every(v => !v);
        const params = {
            objectType: USER_LOG_TYPE.Avatar,
            pageSize: 10e4,
            pageIndex: 1,
            status: status || status === 0 ? [ status ] : statusOptions.map(x => x?.value),
            auditStartTime: auditTime
                ? setUtcStartTimeAndFormat(auditTime[0])
                : isSearchLastWeek
                ? moment().subtract(1, 'weeks').utc().format()
                : null,
            auditEndTime: auditTime
                ? setUtcEndTimeAndFormat(auditTime[1])
                : isSearchLastWeek
                ? moment().utc().format()
                : null,
            ...rest,
            ...(value ? { [field]: value } : {}),
            ...(sortedInfo.current.field
                ? {
                      sortField: sortedInfo.current.field,
                      sortOrder: sortedInfo.current.order === 'ascend' ? 'asc' : 'desc',
                  }
                : {}),
        };
        await getUserAuditLogHref({ boardId: clubBoard }, { ...params, reqType: '头像' }, clubDeployVersion);
    }, [ clubBoard, clubDeployVersion, filterbox, statusOptions ]);

    const handleChangeClubDeploy = useCallback(
        val => {
            setclubDeployVersion(val);
            fetchTableData();
        },
        [ fetchTableData ]
    );
    return (
        <div>
            <FilterBox query={fetchTableData} tableName="clubUserTable" context={filterbox} initialValues={initVal}>
                <FilterBox.Item
                    name="clubDeployVersion"
                    label="数据中心"
                    rules={[ { message: '请选择', required: true } ]}
                >
                    <Select
                        options={ClubDeployVersionOptionsData}
                        placeholder="请选择"
                        onChange={handleChangeClubDeploy}
                    />
                </FilterBox.Item>
                <FilterBox.Item name="status" label="状态">
                    <Select options={statusOptions} allowClear placeholder="不限" />
                </FilterBox.Item>
                <FilterBox.Item className="filterbox-compact-model" type="compactNormal">
                    <Input.Group compact>
                        <FilterBox.Item name="field" noStyle>
                            <Select options={filterSelectionData} />
                        </FilterBox.Item>
                        <FilterBox.Item name="value" noStyle>
                            <Input placeholder="请输入" allowClear />
                        </FilterBox.Item>
                    </Input.Group>
                </FilterBox.Item>
                {AuditTimePicker}
            </FilterBox>

            <Q1Table
                key="clubUserAvatarTable"
                tableName={`operation@page__list__club_user_avatar@${activeKey}`}
                rowKey="id"
                download={activeKey === TABLE_TYPE.Record && hasFunctionPermit('btn__down__club_avatar') && download}
                tableTools={headerTop}
                loading={loading}
                columns={columns}
                dataSource={data}
                pagination={{
                    showSizeChanger: true,
                    showQuickJumper: true,
                    ...pagination,
                    showTotal: () => `共${pagination.total}条`,
                }}
                onChange={handleChange}
                rowSelection={rowSelection}
            />
            <AvatarAudit
                clubBoard={clubBoard}
                clubDeployVersion={clubDeployVersion}
                data={selectedRow}
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
        </div>
    );
}

export default AvatarList;
