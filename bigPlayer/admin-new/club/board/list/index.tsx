import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FilterBox, Q1Table, ColumnsType } from 'q1-antd';
import { Button, Input, message, Modal, Image, Tag, Popover, Select } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import { cloneDeep, get, groupBy, orderBy } from 'lodash';

import ActionGroup from '@/components/ActionGroup';
import { useContentDialogContainer, useContentPermissionFn, useStore } from '@/context';
import Permissions from '@/layouts/components/permissions';
import { changeStatus, deleteBoard, getBoardList } from '@/api/club';
import { simpleTime } from '@/utils/date';
import useSyncState from '@/components/UseSyncState';

import {
    BoardSectionType,
    BoardListResponse,
    BoardDataType,
    BoardstatusConstant,
    SECTION_MODE,
    ClubDeployVersionOptionsData,
} from '@ts/club';

import Create from './components/Create';
import { CATEGORY, defaultData, GrowthSystemsItemType, RULE_ACTION, RULE_CYCLE } from './defaultVal';

/** sections生成树形结构 */
function sectionsS2C(sections: BoardSectionType[]) {
    let result = sections;
    try {
        let sectionsDict = groupBy(sections, 'parentId');
        result = sectionsDict[0]?.map(x => ({
            ...x,
            children: sectionsDict[x.id as any],
        }));
    } catch (e) {
        console.error('sectionsS2C error:', e);
    }
    return result;
}

interface BoardListProps {}
function BoardList(props: BoardListProps) {
    const { hasFunctionPermit } = useContentPermissionFn();

    const filterbox = FilterBox.useFilterBox();

    const {
        Club: { refreshClubStoreApi },
    } = useStore();
    // 表单数据源
    const [ data, setData ] = useState<BoardListResponse[]>([]);
    const [ loading, setLoading ] = useState(false);
    const [ clubDeployVersion, setclubDeployVersion ] = useState(get(ClubDeployVersionOptionsData, '0.value'));
    // 用户编辑是否显示
    const [ visibleCreateModal, setVisibleCreateModal ] = useState(false);
    const [ selectData, setSelectData ] = useState<BoardDataType>(() => cloneDeep(defaultData));

    // form 表单查询
    let initVal = { field: 'accountId', clubDeployVersion: get(ClubDeployVersionOptionsData, '0.value') };
    // 分页
    const [ pagination, setpagination, getPagination ] = useSyncState({
        current: 1,
        total: 0,
        pageSize: 10,
    });

    // 获取表格数据
    const fetchTableData = useCallback(async () => {
        setLoading(true);
        try {
            const { clubDeployVersion, ...values } = await filterbox.validate();
            const { pageSize, current } = getPagination();
            let params = { pageSize, pageIndex: current, ...values };
            const { data = [], total = 0 } = await getBoardList(params, clubDeployVersion);
            if ((data || [])?.length === 0 && current !== 1) {
                setpagination({ ...getPagination(), current: 1 });
                fetchTableData();
            }
            setData(data as BoardListResponse[]);
            setpagination({ ...getPagination(), total: total || 0 });
        } finally {
            setLoading(false);
        }
    }, [ filterbox, getPagination, setpagination ]);

    // 模拟获取数据
    useEffect(() => {
        fetchTableData();
    }, [ fetchTableData ]);

    const handleChange = useCallback(
        (nextPagination: any, _filters, sorter) => {
            setpagination({ ...pagination, ...nextPagination });
            fetchTableData();
        },
        [ fetchTableData, pagination, setpagination ]
    );

    // 后端数据转化
    const FormBack2Front = useCallback(record => {
        const defaultItem = {
            id: undefined,
            category: CATEGORY.ForumCoin,
            type: RULE_ACTION.Post,
            cycle: RULE_CYCLE.Day,
            cycleValue: 0,
            value: 0,
            upperLimit: 0,
        };
        const forumCoinAddRules = record.userRule
            .filter((item: any) => item.category === CATEGORY.ForumCoin && item.type < 100)
            .sort((item: any) => item.type);
        // 兼容旧数据显示
        if (!forumCoinAddRules.some((item: any) => item.type === RULE_ACTION.Top)) {
            forumCoinAddRules.push({ ...defaultItem, type: RULE_ACTION.Top, category: CATEGORY.ForumCoin });
        }
        if (!forumCoinAddRules.some((item: any) => item.type === RULE_ACTION.Digest)) {
            forumCoinAddRules.push({ ...defaultItem, type: RULE_ACTION.Digest, category: CATEGORY.ForumCoin });
        }
        if (!forumCoinAddRules.some((item: any) => item.type === RULE_ACTION.ShareCdk)) {
            forumCoinAddRules.push({ ...defaultItem, type: RULE_ACTION.ShareCdk, category: CATEGORY.ForumCoin });
        }

        if (!forumCoinAddRules.some((item: any) => item.type === RULE_ACTION.Recommend)) {
            forumCoinAddRules.push({ ...defaultItem, type: RULE_ACTION.Recommend, category: CATEGORY.ForumCoin });
        }

        const forumCoinExpendRules = (
            record.userRule.filter((item: any) => item.category === CATEGORY.ForumCoin && item.type > 99) || []
        ).sort((item: any) => item.type);
        // 兼容旧数据显示
        if (
            !forumCoinExpendRules.some((item: any) => item.type === RULE_ACTION.DelPost) ||
            forumCoinExpendRules.length === 0
        ) {
            forumCoinExpendRules.push({ ...defaultItem, type: RULE_ACTION.DelPost, category: CATEGORY.ForumCoin });
        }
        if (
            !forumCoinExpendRules.some((item: any) => item.type === RULE_ACTION.DelComment) ||
            forumCoinExpendRules.length === 0
        ) {
            forumCoinExpendRules.push({ ...defaultItem, type: RULE_ACTION.DelComment, category: CATEGORY.ForumCoin });
        }
        if (
            !forumCoinExpendRules.some((item: any) => item.type === RULE_ACTION.Forbidden) ||
            forumCoinExpendRules.length === 0
        ) {
            forumCoinExpendRules.push({ ...defaultItem, type: RULE_ACTION.Forbidden, category: CATEGORY.ForumCoin });
        }
        const growthSystems = record?.growthSystems?.length
            ? record.growthSystems.map((v: GrowthSystemsItemType) => ({
                  ...v,
                  expCopy: v.exp,
                  messageCopy: v.message,
                  titleCopy: v.title,
                  goods: v?.goods ?? [],
              }))
            : [ { level: 1, exp: 0, expCopy: 0, title: 0, goods: [], message: '' } ];
        let experienceRules = record.userRule.filter((item: any) => item.category === CATEGORY.Experience);
        /**
         * 经验值规则表单为动态渲染，如果后端未返回对应数据则不会显示该表单
         * 但实际是需要显示该表单的，所以如果接口没有返回值则需填充默认值
         */
        const experienceRulesActions: Array<RULE_ACTION> = [
            RULE_ACTION.Post,
            RULE_ACTION.Comment,
            RULE_ACTION.ThumsUp,
            RULE_ACTION.Top,
            RULE_ACTION.Digest,
            RULE_ACTION.Like,
            RULE_ACTION.View,
            RULE_ACTION.Collected,
            RULE_ACTION.Recommend,
            RULE_ACTION.ShareCdk,
        ];

        experienceRulesActions.forEach(type => {
            if (!experienceRules.some((item: any) => item.type === type)) {
                experienceRules.push({ ...defaultItem, type, category: CATEGORY.Experience });
            }
        });

        experienceRules = orderBy(experienceRules, [ 'type' ], [ 'asc' ]);

        const toolMode = record.toolbar?.length ? true : false;
        const toolbar = record.toolbar.map((item: any) => ({
            ...item,
            notificationMember: item.notificationMember === 1 ? true : false,
        }));
        let recordFront: any = {
            ...record,
            forumCoinAddRules,
            forumCoinExpendRules,
            experienceRules,
            toolMode,
            sectionMode: [
                SECTION_MODE.IsGame,
                ...(record?.isBC ? [ SECTION_MODE.IsBC ] : []),
                ...(record?.isTourist ? [ SECTION_MODE.IsTourist ] : []),
            ],
            toolbar,
            growthSystems,
        };
        return recordFront;
    }, []);

    // 编辑
    const handleEdit = useCallback(
        record => {
            setSelectData({ ...FormBack2Front(record), clubDeployVersion });
            setVisibleCreateModal(true);
        },
        [ FormBack2Front, clubDeployVersion ]
    );

    const getContainer = useContentDialogContainer();

    // 停用、启用
    const handleUpdateStatus = useCallback(
        (record: BoardListResponse) => {
            Modal.confirm({
                getContainer,
                title: '系统提示',
                icon: <WarningOutlined />,
                content: (
                    <>
                        <span>确认</span>
                        <span>{BoardstatusConstant[record?.status]}</span>【{record?.name}】<span>这个版块吗</span>？
                    </>
                ),
                onCancel: () => {},
                onOk: async () => {
                    const { code, msg } = await changeStatus(
                        {
                            id: record.id,
                            status: record?.status === 0 ? 1 : 0,
                        },
                        clubDeployVersion
                    );
                    if (code === 0) {
                        message.success(BoardstatusConstant[record?.status] + '成功');
                        fetchTableData();
                        refreshClubStoreApi();
                    } else {
                        message.error(msg);
                    }
                },
            });
        },
        [ clubDeployVersion, fetchTableData, getContainer, refreshClubStoreApi ]
    );

    // 删除
    const handleDelete = useCallback(
        async record => {
            Modal.confirm({
                getContainer,
                title: '删除版块',
                icon: <WarningOutlined />,
                content: (
                    <>
                        <span>确认删除</span>【{record?.name}】<span>这个版块吗</span>？
                        <div style={{ color: '#aaa' }}>操作不可恢复，请谨慎操作！</div>
                    </>
                ),
                onCancel: () => {},
                onOk: async () => {
                    const { code, msg } = await deleteBoard(
                        {
                            id: record.id,
                        },
                        clubDeployVersion
                    );
                    if (code === 0) {
                        message.success('删除成功');
                        fetchTableData();
                        refreshClubStoreApi();
                    } else {
                        message.error(msg);
                    }
                },
            });
        },
        [ clubDeployVersion, fetchTableData, getContainer, refreshClubStoreApi ]
    );

    const columns: ColumnsType<BoardListResponse> = useMemo(() => {
        return [
            {
                dataIndex: 'id',
                title: '版块ID',
                switch: 1,
                align: 'center',
            },
            {
                dataIndex: 'name',
                title: '版块名称',
                switch: 1,
                align: 'center',
            },
            {
                dataIndex: 'imageUrl',
                title: '版块图片',
                switch: 1,
                align: 'center',
                render: v => {
                    return v ? (
                        <Image
                            src={v}
                            style={{ minHeight: '48px', maxHeight: '100px', minWidth: '60px', maxWidth: '180px' }}
                        />
                    ) : (
                        ''
                    );
                },
            },
            {
                dataIndex: 'toolbar',
                title: '功能栏',
                switch: 1,
                align: 'left',
                width: 300,
                render: v => {
                    return v?.map((x: any) => (
                        <Tag key={x?.id} color="blue" style={{ marginBottom: '8px' }}>
                            {x?.name}
                        </Tag>
                    ));
                },
            },
            {
                dataIndex: 'sections',
                title: '资讯栏目',
                switch: 1,
                align: 'left',
                width: 300,
                render: val => {
                    return sectionsS2C(val || [])?.map((x: BoardSectionType) =>
                        x?.children?.length ? (
                            <Popover
                                key={x?.id + 'Popover'}
                                content={x.children.map(child => (
                                    <Tag key={child?.id} style={{ marginBottom: '8px' }}>
                                        {child?.name}
                                    </Tag>
                                ))}
                            >
                                <Tag key={x?.id} color="cyan" style={{ marginBottom: '8px' }}>
                                    {x?.name}
                                </Tag>
                            </Popover>
                        ) : (
                            <Tag key={x?.id} color="cyan" style={{ marginBottom: '8px' }}>
                                {x?.name}
                            </Tag>
                        )
                    );
                },
            },
            {
                dataIndex: 'operatorTime',
                title: '操作时间 ',
                switch: 1,
                align: 'center',
                render: v => (v ? simpleTime(v) : ''),
            },
            {
                dataIndex: 'operatorName',
                title: '操作人 ',
                switch: 1,
                align: 'center',
            },
            {
                dataIndex: 'operation',
                title: '操作',
                switch: 1,
                align: 'center',
                width: 160,
                resizable: false,
                render: (v, record: BoardListResponse) => {
                    return (
                        <ActionGroup
                            btns={[
                                {
                                    title: '',
                                    icon: '',
                                    hidden: !hasFunctionPermit('btn__update__club_board'),
                                    props: {
                                        type: 'link',
                                        children: '编辑',
                                        style: { padding: '0 2px' },
                                        onClick: () => handleEdit(record),
                                    },
                                },

                                {
                                    title: '',
                                    icon: '',
                                    hidden: !hasFunctionPermit('btn__update__club_board_stop'),
                                    props: {
                                        type: 'link',
                                        children: BoardstatusConstant[record?.status],
                                        style: { padding: '0 2px' },
                                        onClick: () => handleUpdateStatus(record),
                                    },
                                },
                                {
                                    title: '',
                                    icon: '',
                                    hidden: !hasFunctionPermit('btn__del__club_board'),
                                    props: {
                                        danger: true,
                                        type: 'link',
                                        children: '删除',
                                        style: { padding: '0 2px' },
                                        onClick: () => handleDelete(record),
                                    },
                                },
                            ]}
                        />
                    );
                },
            },
        ];
    }, [ handleDelete, handleEdit, handleUpdateStatus, hasFunctionPermit ]);

    const onHandleAdd = useCallback(() => {
        setVisibleCreateModal(true);
        setSelectData(
            cloneDeep({
                ...defaultData,
                clubDeployVersion,
            })
        );
    }, [ clubDeployVersion ]);
    const headerTop = (
        <>
            <Permissions value="btn__add__club_board">
                <Button type="primary" onClick={() => onHandleAdd()}>
                    新增版块
                </Button>
            </Permissions>
        </>
    );

    const clubDeployVersionChange = useCallback(
        val => {
            setclubDeployVersion(val);
            fetchTableData();
        },
        [ fetchTableData ]
    );

    return (
        <div>
            <FilterBox query={fetchTableData} tableName="clubBoardTable" context={filterbox} initialValues={initVal}>
                <FilterBox.Item
                    name="clubDeployVersion"
                    label="数据中心"
                    rules={[ { message: '请选择', required: true } ]}
                >
                    <Select options={ClubDeployVersionOptionsData} onChange={clubDeployVersionChange}></Select>
                </FilterBox.Item>
                <FilterBox.Item name="name" label="版块名称">
                    <Input placeholder="请输入" allowClear onSubmit={fetchTableData} />
                </FilterBox.Item>
            </FilterBox>

            <Q1Table
                tableTools={headerTop}
                key="clubBoardTable"
                tableName="operation@page__list__club_board"
                loading={loading}
                rowKey="id"
                columns={columns}
                dataSource={data}
                pagination={{
                    showSizeChanger: true,
                    ...pagination,
                    showTotal: () => `共${pagination.total}条`,
                }}
                onChange={handleChange}
            />
            <Create
                data={selectData}
                visible={visibleCreateModal}
                onOk={() => {
                    setVisibleCreateModal(false);
                    fetchTableData();
                    refreshClubStoreApi();
                }}
                onCancel={() => {
                    setVisibleCreateModal(false);
                }}
            />
        </div>
    );
}
export default BoardList;
