import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FilterBox, Q1Table, ColumnsType } from 'q1-antd';
import { Button, Input, message, Modal, Select, Spin, Tag, TreeSelect } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import type { SorterResult } from 'antd/es/table/interface';
import { inject, observer } from 'mobx-react';
import type { Store } from 'antd/es/form/interface';
import { get, groupBy, pick } from 'lodash';

import { quickPickTimeRange, setUtcEndTimeAndFormat, setUtcStartTimeAndFormat, simpleTime } from '@/utils/date';
import ActionGroup from '@/components/ActionGroup';
import { useContentPermissionFn, useReactive } from '@/context';
import { changeUserinfoStatus, getUserList, getUserListHref } from '@/api/club';
import useSyncState from '@/hooks/state/useSyncState';
import RangePicker from '@/components/RangePicker';

import {
    UesrNickNameOptionsData,
    UesrstatusOptionsData,
    UesrstatusConstant,
    UesrstatusColorConstant,
    UserinfoListParams,
    UserinfoListResponse,
    UesrsexConstant,
    UESRSTATUS,
    DATE_TYPE,
    DateTypeConstant,
    DATE_VALUE,
    BoardPermitOptionsType,
    BOARD_PERMIT_SEPARATE,
    UserLabelTreeType,
} from '@ts/club';

import UserEdit from './components/UserEdit';
import UserMuted from './components/UserMuted';
import UserDetail from './components/UserDetail';
import { usePremitClubBoard } from '../../board/hooks/useClubBoardOptions';
import UserForbid from './components/UserForbid';
import UserTag from './components/UserTag';

interface UserListProps {
    clubBoardOptions: BoardPermitOptionsType[];
}
interface UserListPropsMobx extends UserListProps, Pick<Store, 'Club'> {}
function UserList(props: UserListProps) {
    const { hasFunctionPermit } = useContentPermissionFn();

    const {
        clubBoardOptions,
        Club: { userRoleDictAll, userLabelDictAll },
    } = props as UserListPropsMobx;

    const filterbox = FilterBox.useFilterBox();

    // 表单数据源
    const [ data, setData ] = useState<UserinfoListResponse[]>([]);
    const [ loading, setLoading ] = useState(false);

    const [ clubDeployVersion, setclubDeployVersion ] = useState(get(clubBoardOptions, '0.value'));

    const [ visibleEditModal, setVisibleEditModal ] = useState(false); // 用户编辑是否显示
    const [ visibleMutedModal, setVisibleMutedModal ] = useState(false); // 用户编辑是否显示

    const [ selectData, setselectData ] = useState<UserinfoListResponse>();
    const [ batchForbidVisible, setBatchForbidVisible ] = useState(false);
    // form 表单查询
    let initVal = useMemo(() => {
        return { field: 'userId', boardId: get(clubBoardOptions, '0.children.0.value') };
    }, [ clubBoardOptions ]);
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
            const { field, value, boardId, registerTime, loginTime, ...rest } = await filterbox.validate();
            if ([ null, undefined ].includes(boardId)) {
                message.warn('请选择所属版块');
                return false;
            }
            const { pageSize, current } = getPagination();
            let query = { boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1] };
            let params = {
                pageSize,
                pageIndex: current,
                ...(registerTime?.length
                    ? {
                          registerStartTime: setUtcStartTimeAndFormat(registerTime[0]),
                          registerEndTime: setUtcEndTimeAndFormat(registerTime[1]),
                      }
                    : {}),
                ...(loginTime?.length
                    ? {
                          loginStartTime: setUtcStartTimeAndFormat(loginTime[0]),
                          loginEndTime: setUtcEndTimeAndFormat(loginTime[1]),
                      }
                    : {}),
                ...rest,
                ...(value ? { [field]: value } : {}),
                ...(sortedInfo.current.field
                    ? {
                          sortField: sortedInfo.current.field,
                          sortOrder: sortedInfo.current.order === 'ascend' ? 'asc' : 'desc',
                      }
                    : {}),
            } as UserinfoListParams;
            const { data, total = 0 } = await getUserList(query, params, clubDeployVersion);
            if ((data || [])?.length === 0 && current !== 1) {
                setpagination({ ...getPagination(), current: 1 });
                fetchTableData();
            }
            setData(data || []);
            setpagination({ ...getPagination(), total });
        } finally {
            setLoading(false);
        }
    }, [ clubDeployVersion, filterbox, getPagination, setpagination ]);

    useEffect(() => {
        fetchTableData();
    }, [ fetchTableData ]);

    useReactive(() => {
        fetchTableData();
    });

    const handleChange = useCallback(
        (nextPagination: any, _filters, sorter: any) => {
            setpagination({ ...pagination, ...nextPagination });
            sortedInfo.current = sorter;
            fetchTableData();
        },
        [ fetchTableData, pagination, setpagination ]
    );

    // 编辑
    const handleEdit = useCallback(record => {
        setVisibleEditModal(true);
        setselectData(record);
    }, []);

    // 封禁
    const handleForbid = useCallback(record => {
        setVisibleMutedModal(true);
        setselectData({
            ...record,
            status: UESRSTATUS.Muted,
            dateType: DATE_TYPE.Forever,
            dateValue: DATE_VALUE.Forever,
            remark: '',
        });
    }, []);

    // 解禁
    const handleOpen = useCallback(
        record => {
            Modal.confirm({
                title: '解禁提示',
                icon: <InfoCircleOutlined />,
                content: (
                    <div>
                        确认解禁【{record?.userName}】的【
                        {UesrstatusConstant[record?.status as keyof typeof UesrstatusConstant]}】 状态吗？
                    </div>
                ),
                okText: '确定',
                okType: 'primary',
                cancelText: '取消',
                onOk: async function () {
                    const { code, msg } = await changeUserinfoStatus(
                        { boardId: String(record?.boardId) },
                        {
                            userInfoId: record.userInfoId,
                            userName: record.userName,
                            userStatsId: record.userStatsId,
                            status: UESRSTATUS.Normal,
                        },
                        clubDeployVersion
                    );
                    if (code === 0) {
                        message.success('解封成功');
                        fetchTableData();
                    } else {
                        message.error(msg);
                    }
                },
                onCancel: function () {},
                autoFocusButton: 'ok',
            });
        },
        [ clubDeployVersion, fetchTableData ]
    );

    // 详情
    const [ _boardId, setBoardId ] = useState(
        get(clubBoardOptions, '0.children.0.value').split(BOARD_PERMIT_SEPARATE)[1]
    );

    const [ userDetail, setUserDetail ] = useState<{
        visible: boolean;
        detail: UserinfoListResponse | null;
    }>({
        visible: false,
        detail: null,
    });

    const [ userTag, setUserTag ] = useState<{
        visible: boolean;
        detail: UserinfoListResponse | null;
    }>({
        visible: false,
        detail: null,
    });

    const columns: ColumnsType<UserinfoListResponse> = useMemo(() => {
        return [
            {
                dataIndex: 'userInfoId',
                title: '大玩家用户ID',
                switch: 1,
                align: 'center',
                width: 150,
            },
            {
                dataIndex: 'nickName',
                title: '昵称',
                switch: 1,
                align: 'center',
                width: 160,
            },
            {
                dataIndex: 'userId',
                title: '冰川/渠道账号ID',
                align: 'center',
                switch: 1,
                width: 150,
            },

            {
                dataIndex: 'userName',
                title: '冰川通行证名称',
                switch: 1,
                align: 'center',
                width: 150,
            },
            {
                dataIndex: 'isBc',
                title: '是否冰川账号',
                switch: 1,
                align: 'center',
                width: 150,
                render: v => {
                    return v ? '是' : '否';
                },
            },
            {
                dataIndex: 'status',
                title: '状态',
                switch: 1,
                align: 'center',
                width: 150,
                render: v => (
                    <Tag color={UesrstatusColorConstant[v as keyof typeof UesrstatusColorConstant]}>
                        {UesrstatusConstant[v as keyof typeof UesrstatusConstant] || ''}
                    </Tag>
                ),
            },
            {
                dataIndex: 'tags',
                title: '用户画像',
                switch: 1,
                align: 'center',
                width: 150,
                render: (v: string[], row) => {
                    const hasTag = v && v.length > 0;
                    let tagStr = hasTag ? v.join('、') : '-';
                    if (hasTag && v.length >= 3) {
                        tagStr += '...';
                    }
                    return hasTag ? (
                        <div
                            onClick={() => {
                                setUserTag({
                                    visible: true,
                                    detail: row,
                                });
                            }}
                            className="q1-link"
                        >
                            {tagStr}
                        </div>
                    ) : (
                        tagStr
                    );
                },
            },
            {
                dataIndex: 'forumPoint',
                title: '论坛币',
                switch: 1,
                width: 120,
                align: 'center',
            },
            {
                dataIndex: 'experience',
                title: '经验值',
                switch: 1,
                width: 120,
                align: 'center',
            },
            {
                dataIndex: 'activation',
                title: '活跃度',
                switch: 1,
                align: 'center',
                width: 120,
                render: v => (v ? v / 100 : 0),
            },
            {
                dataIndex: 'postCount',
                title: '发帖数',
                switch: 1,
                width: 120,
                align: 'center',
            },
            {
                dataIndex: 'userRoleType',
                title: '用户分组',
                switch: 1,
                width: 120,
                align: 'center',
            },
            {
                dataIndex: 'labelType',
                title: '用户标签',
                switch: 1,
                width: 150,
                align: 'center',
            },

            {
                dataIndex: 'ip',
                title: 'IP',
                switch: 1,
                width: 150,
                align: 'center',
            },
            {
                dataIndex: 'birthday',
                title: '生日',
                switch: 1,
                width: 150,
                align: 'center',
            },
            {
                dataIndex: 'sex',
                title: '性别',
                switch: 1,
                align: 'center',
                width: 80,
                render: (v: unknown) => UesrsexConstant[v as keyof typeof UesrsexConstant] || '',
            },
            {
                dataIndex: 'region',
                title: '地区',
                switch: 1,
                width: 120,
                align: 'center',
            },
            {
                dataIndex: 'registerTime',
                title: '账号创建时间',
                switch: 1,
                align: 'center',
                sorter: true,
                width: 168,
                render: v => simpleTime(v || ''),
            },
            {
                dataIndex: 'lastLoginTime',
                title: '最后登录社区时间',
                switch: 1,
                align: 'center',
                width: 168,
                sorter: true,
                render: v => simpleTime(v || ''),
            },
            {
                dataIndex: 'remark',
                title: '备注',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
                width: 220,
                render: (v, record: UserinfoListResponse) => (
                    <>
                        <span className="color-red">{v}</span>
                        {record.status !== UESRSTATUS.Normal ? (
                            <div>
                                <Tag color="#f50">
                                    <span>封禁</span>
                                    {record?.blockedTimeValue ? record?.blockedTimeValue : ''}
                                    {DateTypeConstant[record?.blockedTimeType as DATE_TYPE]}
                                    {record?.blockedTimeType === DATE_TYPE.Forever
                                        ? ''
                                        : `至${simpleTime(record?.blockedTime)}`}
                                </Tag>
                            </div>
                        ) : (
                            ''
                        )}
                    </>
                ),
            },
            {
                dataIndex: 'operation',
                disabledSwitch: true,
                resizable: false,
                fieldGroup: '基础信息',
                title: '操作',
                switch: 1,
                fixed: 'right',
                align: 'center',
                width: 124,
                render: (_, record: UserinfoListResponse) => {
                    return (
                        <ActionGroup
                            className="operation-btn-group"
                            btns={[
                                {
                                    title: '',
                                    icon: '',
                                    hidden: !hasFunctionPermit('btn__update__club_user'),
                                    props: {
                                        type: 'link',
                                        children: '编辑',
                                        onClick: () => handleEdit(record),
                                    },
                                },
                                record?.status === 0
                                    ? {
                                          title: '',
                                          icon: '',
                                          hidden: !hasFunctionPermit('btn__update__club_user_forbid'),
                                          props: {
                                              type: 'link',
                                              children: '封禁',
                                              onClick: () => handleForbid(record),
                                          },
                                      }
                                    : {
                                          title: '',
                                          icon: '',
                                          hidden: !hasFunctionPermit('btn__update__club_user_open'),
                                          props: {
                                              type: 'link',
                                              children: '解禁',
                                              onClick: () => handleOpen(record),
                                          },
                                      },
                                {
                                    title: '',
                                    icon: '',
                                    hidden: !hasFunctionPermit('btn__detail__club_user_detail'),
                                    props: {
                                        type: 'link',
                                        children: '详情',
                                        onClick: () => {
                                            setUserDetail({
                                                visible: true,
                                                detail: record,
                                            });
                                        },
                                    },
                                },
                            ]}
                        />
                    );
                },
            },
        ];
    }, [ handleEdit, handleForbid, handleOpen, hasFunctionPermit ]);

    // 导出
    const download = useCallback(async () => {
        const { field, value, boardId, ...rest } = await filterbox.validate();
        if ([ null, undefined ].includes(boardId)) {
            message.warn('请选择所属版块');
            return false;
        }
        const query = { boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1] };
        const params = {
            pageSize: 10e4,
            pageIndex: 1,
            ...rest,
            ...(value ? { [field]: value } : {}),
            ...(sortedInfo.current.field
                ? {
                      sortField: sortedInfo.current.field,
                      sortOrder: sortedInfo.current.order === 'ascend' ? 'asc' : 'desc',
                  }
                : {}),
        } as UserinfoListParams;
        await getUserListHref(query, params, clubDeployVersion);
    }, [ clubDeployVersion, filterbox ]);

    const handleChangeBoardId = useCallback(
        async val => {
            const [ clubDeploy ] = val.split(BOARD_PERMIT_SEPARATE);
            setBoardId(val.split(BOARD_PERMIT_SEPARATE)[1]);
            setclubDeployVersion(clubDeploy);
            fetchTableData();
        },
        [ fetchTableData ]
    );
    const userRoleTypeOptions = useMemo(() => {
        return (userRoleDictAll[clubDeployVersion] ?? []).map((x: any) => ({ ...pick(x, [ 'value', 'label' ]) }));
    }, [ clubDeployVersion, userRoleDictAll ]);

    const labelTypeOptions = useMemo(() => {
        let result: UserLabelTreeType[] = [];
        try {
            if (!userLabelDictAll[clubDeployVersion]) {
                return;
            }
            let userLabelDict = groupBy(userLabelDictAll[clubDeployVersion] ?? [], 'parentId');
            result = userLabelDict[0].map(x => ({
                ...x,
                title: x.name,
                value: x.id,
                children: userLabelDict[x.id as any]?.map(child => ({
                    ...child,
                    title: child.name,
                    value: child.id,
                })),
            }));
        } catch (e) {
            console.log('userlLabelTreeList', e);
        }
        return result;
    }, [ clubDeployVersion, userLabelDictAll ]);
    const tableTools = useMemo(
        () => (
            <Button type="primary" onClick={() => setBatchForbidVisible(true)}>
                批量封禁
            </Button>
        ),
        []
    );
    return (
        <div>
            <FilterBox query={fetchTableData} tableName="clubUserTable" context={filterbox} initialValues={initVal}>
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
                <FilterBox.Item className="filterbox-compact-model" type="compactNormal">
                    <Input.Group compact>
                        <FilterBox.Item name="field" noStyle>
                            <Select options={UesrNickNameOptionsData} />
                        </FilterBox.Item>
                        <FilterBox.Item name="value" noStyle>
                            <Input placeholder="请输入" allowClear onPressEnter={fetchTableData} />
                        </FilterBox.Item>
                    </Input.Group>
                </FilterBox.Item>

                <FilterBox.Item name="userRoleType" label="用户分组">
                    <Select options={userRoleTypeOptions} allowClear placeholder="不限" />
                </FilterBox.Item>

                <FilterBox.Item name="labelType" label="用户标签">
                    <TreeSelect treeData={labelTypeOptions} allowClear treeDefaultExpandAll placeholder="不限" />
                </FilterBox.Item>

                <FilterBox.Item name="status" label="用户状态">
                    <Select options={UesrstatusOptionsData} allowClear />
                </FilterBox.Item>
                <FilterBox.Item name="registerTime" label="账号创建时间">
                    <RangePicker allowClear ranges={quickPickTimeRange} inputReadOnly />
                </FilterBox.Item>
                <FilterBox.Item name="loginTime" label="最后登录社区时间">
                    <RangePicker allowClear ranges={quickPickTimeRange} inputReadOnly />
                </FilterBox.Item>
            </FilterBox>

            <Q1Table
                scroll={{ x: 2600 }}
                download={hasFunctionPermit('btn__down__club_user') && download}
                tableName="operation@page__list__club_user_list"
                key="clubUserTable"
                loading={loading}
                rowKey="userStatsId"
                columns={columns}
                dataSource={data}
                tableTools={tableTools}
                pagination={{
                    showSizeChanger: true,
                    showQuickJumper: true,
                    ...pagination,
                    showTotal: () => `共${pagination.total}条`,
                }}
                onChange={handleChange}
            />

            <UserEdit
                data={selectData}
                visible={visibleEditModal}
                clubDeployVersion={clubDeployVersion}
                userRoleTypeOptions={userRoleTypeOptions}
                labelTypeOptions={labelTypeOptions}
                onOk={() => {
                    setVisibleEditModal(false);
                    fetchTableData();
                }}
                onCancel={() => {
                    setVisibleEditModal(false);
                }}
            />
            <UserMuted
                data={selectData}
                visible={visibleMutedModal}
                clubDeployVersion={clubDeployVersion}
                onOk={() => {
                    setVisibleMutedModal(false);
                    fetchTableData();
                }}
                onCancel={() => {
                    setVisibleMutedModal(false);
                }}
            />
            <UserDetail
                onClose={() => {
                    setUserDetail({
                        ...userDetail,
                        visible: false,
                    });
                }}
                visible={userDetail.visible}
                boardId={_boardId}
                detail={userDetail.detail}
                clubDeployVersion={clubDeployVersion}
            />
            <UserTag
                onClose={() => {
                    setUserTag({
                        ...userTag,
                        visible: false,
                    });
                }}
                visible={userTag.visible}
                detail={userTag.detail}
                clubDeployVersion={clubDeployVersion}
            />
            <UserForbid
                onClose={() => setBatchForbidVisible(false)}
                visible={batchForbidVisible}
                boardId={_boardId}
                onSubmit={() => {
                    setBatchForbidVisible(false);
                    fetchTableData();
                }}
                clubDeployVersion={clubDeployVersion}
            />
        </div>
    );
}

const UserListBase = inject('Club')(observer(UserList));

export default function CommentListAll(props: any) {
    const { clubBoardOptions } = usePremitClubBoard();
    return !clubBoardOptions.length ? (
        <Spin size="large">
            <div style={{ height: '100vh' }}></div>
        </Spin>
    ) : (
        <UserListBase {...props} clubBoardOptions={clubBoardOptions} />
    );
}
