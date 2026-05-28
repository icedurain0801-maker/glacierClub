import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FilterBox, Q1Table, ColumnsType } from 'q1-antd';
import { Input, Select, Button, Modal, message } from 'antd';
import type { SorterResult, TableRowSelection } from 'antd/es/table/interface';
import type { Store } from 'antd/es/form/interface';
import moment from 'moment';
import { get, omit } from 'lodash';
import { v4 as uuidv4 } from 'uuid';

import Permissions from '@/layouts/components/permissions';
import { getUserAuditLog, getUserAuditLogHref, userAuditCancel, userMachineAudit } from '@/api/club';
import { quickPickTimeRange, setUtcEndTimeAndFormat, setUtcStartTimeAndFormat, simpleTime } from '@/utils/date';
import { useContentDialogContainer, useContentPermissionFn } from '@/context';
import useSyncState from '@/hooks/state/useSyncState';
import RangePicker from '@/components/RangePicker';
import { TABLE_TYPE } from '@/pages/club/content/post/list';

import {
    ActiveKeyType,
    SimpleOptionType,
    AuditStatusConstant,
    NicknameListType,
    USER_LOG_TYPE,
    AUDIT_STATUS,
    NickNameAuditFilterOptionsData,
    NickNameRecordFilterOptionsData,
    ClubDeployVersionOptionsData,
    MAX_MACHINE_AUDIT_NUMS,
} from '@ts/club';

import Audit from './Audit';

interface NickNameListProps {
    activeKey: ActiveKeyType;
    statusOptions: SimpleOptionType[];
    clubBoard: number;
}
interface UserListPropsMobx extends NickNameListProps, Pick<Store, 'Club'> {}
function NickNameList(props: NickNameListProps) {
    const { activeKey, statusOptions, clubBoard } = props as UserListPropsMobx;
    const { hasFunctionPermit } = useContentPermissionFn();
    const filterbox = FilterBox.useFilterBox();

    // 表单数据源
    const [ data, setData ] = useState<NicknameListType[]>([]);
    const [ loading, setLoading ] = useState(false);
    const [ clubDeployVersion, setclubDeployVersion ] = useState(get(ClubDeployVersionOptionsData, '0.value'));

    const [ visibleAuditModal, setVisibleAuditModal ] = useState(false);
    const [ selectedRow, setselectedRow ] = useState<NicknameListType[]>([]);

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
    const fetchTableData = useCallback(async () => {
        setLoading(true);
        try {
            const { field, value, status, auditTime, ...rest } = await filterbox.validate();

            const { pageSize, current } = getPagination();

            let params = {
                objectType: USER_LOG_TYPE.NickName,
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
            const { data = [], total = 0 } = await getUserAuditLog({ boardId: clubBoard }, params, clubDeployVersion);
            if ((data || [])?.length === 0 && current !== 1) {
                setpagination({ ...getPagination(), current: 1 });
                fetchTableData();
            }
            setData(((data || []) as unknown) as NicknameListType[]);
            setpagination({ ...getPagination(), total });
        } finally {
            setLoading(false);
        }
    }, [ clubBoard, clubDeployVersion, filterbox, getPagination, setpagination, statusOptions ]);

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
        (record: NicknameListType) => {
            Modal.confirm({
                getContainer,
                title: `系统提示`,
                content: (
                    <div>
                        <span>确定将</span>【{record?.content}】<span>昵称作废</span>？
                        <br />
                        <p style={{ color: '#999' }}>
                            <span>作废后将返回上一次审核通过的昵称</span>【{record?.beforeContent}】
                        </p>
                        <br />
                    </div>
                ),
                onOk: async () => {
                    const { code, msg } = await userAuditCancel(
                        { boardId: String(clubBoard) }, // String(record?.boardId) },
                        [ record?.id ],
                        'nickName',
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
                { boardId: String(clubBoard), type: 1, code: getUuid() },
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

    const columns: ColumnsType<NicknameListType> = useMemo(() => {
        let recodeColumns: ColumnsType<NicknameListType> = [
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
        let operationColumns: ColumnsType<NicknameListType> = [
            {
                dataIndex: 'operation',
                title: '操作',
                switch: 1,
                disabledSwitch: true,
                resizable: false,
                align: 'center',
                width: 66,
                render: (v, record) => (
                    <Button
                        type="link"
                        disabled={record?.status !== AUDIT_STATUS.Passed}
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
                title: '昵称ID',
                switch: 1,
                align: 'center',
            },
            {
                dataIndex: 'content',
                title: '修改昵称',
                switch: 1,
                align: 'center',
            },
            {
                dataIndex: 'beforeContent',
                title: '原昵称',
                switch: 1,
                align: 'center',
            },
            {
                dataIndex: 'status',
                title: '状态',
                switch: 1,
                align: 'center',
                render: (v: keyof typeof AuditStatusConstant) => AuditStatusConstant[v] || '',
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

    const headerTop = activeKey === 'audit' && (
        <>
            <Permissions value="btn__update__club_nickName_audit">
                <Button
                    type="primary"
                    onClick={handleMachineAudit}
                    disabled={selectedRow?.length ? false : true}
                    loading={machineAuditLoading}
                >
                    批量机审
                </Button>
            </Permissions>
            <Permissions value="btn__update__club_nickName_audit">
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
    const rowSelection: TableRowSelection<NicknameListType> | undefined = useMemo(() => {
        return activeKey === 'audit'
            ? {
                  selectedRowKeys: selectedRow.map(x => x.id),
                  columnWidth: 50,
                  onChange: (keys: any, selectedRows: any) => {
                      setselectedRow(selectedRows || []);
                  },
              }
            : undefined;
    }, [ activeKey, selectedRow ]);

    const filterSelectionData = useMemo(() => {
        return activeKey === 'audit' ? NickNameAuditFilterOptionsData : NickNameRecordFilterOptionsData;
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
            objectType: USER_LOG_TYPE.NickName,
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
        await getUserAuditLogHref({ boardId: clubBoard }, { ...params, reqType: '昵称' }, clubDeployVersion);
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
                key="clubUserNickNameTable"
                rowKey="id"
                tableName={`operation@page__list__club_user_nickName@${activeKey}`}
                tableTools={headerTop}
                download={activeKey === TABLE_TYPE.Record && hasFunctionPermit('btn__down__club_nickName') && download}
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
            <Audit
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

export default NickNameList;
