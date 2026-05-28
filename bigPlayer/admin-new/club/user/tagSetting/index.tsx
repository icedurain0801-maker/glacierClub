import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Modal, Select, Spin, message } from 'antd';
import { ColumnsType, FilterBox, Q1Table } from 'q1-antd';

import { useContentPermissionFn } from '@/context';
import Permissions from '@/layouts/components/permissions';
import ActionGroup from '@/components/ActionGroup';
import { downloadClubTagSettingList, getTagSettingList, removeTagSetting } from '@/api/clubTag';
import { simpleTime } from '@/utils/date';

import { BOARD_PERMIT_SEPARATE, BoardPermitOptionsType, CLUB_DEPLOY_VERSION } from '@ts/club';
import { DefaultPagination } from '@ts/enum/table';
import { TagSettingListItem, getRechargeTypeStr } from '@ts/clubTag';

import { usePremitClubBoard } from '../../board/hooks/useClubBoardOptions';
import Create from './components/create';

type PaginationState = {
    pageIndex: number;
    pageSize: number;
};

interface TagSettingPageProps {
    clubBoardOptions: BoardPermitOptionsType[];
}

const TagSettingPage: React.FC<TagSettingPageProps> = ({ clubBoardOptions }) => {
    const filterbox = FilterBox.useFilterBox();
    const { hasFunctionPermit } = useContentPermissionFn();

    const currentPagination = useRef<PaginationState>({ ...DefaultPagination });

    const [ loading, setLoading ] = useState(false);
    const [ tableData, setTableData ] = useState<{ data: TagSettingListItem[]; total: number }>({
        data: [],
        total: 0,
    });
    const [ selectedBoardValue, setSelectedBoardValue ] = useState<string | undefined>();
    const [ boardId, setBoardId ] = useState<number | null>(null);
    const [ clubDeployVersion, setClubDeployVersion ] = useState<CLUB_DEPLOY_VERSION | null>(null);
    const [ drawerState, setDrawerState ] = useState<{ visible: boolean; record: TagSettingListItem | null }>({
        visible: false,
        record: null,
    });

    const initialBoardValue = useMemo(() => {
        return clubBoardOptions?.[0]?.children?.[0]?.value as string | undefined;
    }, [ clubBoardOptions ]);

    const resolveBoardValue = useCallback((value?: string) => {
        if (!value) {
            return { deploy: null, board: null };
        }
        const [ deploy, board ] = value.split(BOARD_PERMIT_SEPARATE);
        return {
            deploy: deploy as CLUB_DEPLOY_VERSION,
            board: Number(board),
        };
    }, []);

    useEffect(() => {
        if (!selectedBoardValue && initialBoardValue) {
            setSelectedBoardValue(initialBoardValue);
            const { deploy, board } = resolveBoardValue(initialBoardValue);
            setClubDeployVersion(deploy);
            setBoardId(board);
            currentPagination.current = { ...DefaultPagination };
        }
    }, [ initialBoardValue, resolveBoardValue, selectedBoardValue ]);

    const fetchTableData = useCallback(async () => {
        setLoading(true);
        try {
            const values = await filterbox.validate();
            const boardValue: string | undefined = values.boardId ?? selectedBoardValue;
            const { deploy, board } = resolveBoardValue(boardValue);
            if (!deploy || board == null) {
                message.warning('请选择版块');
                setTableData({ data: [], total: 0 });
                return;
            }
            setSelectedBoardValue(boardValue);
            setClubDeployVersion(deploy);
            setBoardId(board);

            const params = {
                boardId: board,
                name: values.name?.trim(),
                pageIndex: currentPagination.current.pageIndex,
                pageSize: currentPagination.current.pageSize,
            };
            const { code, data = [], total = 0 } = await getTagSettingList(params, deploy);
            if (code === 0) {
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
    }, [ filterbox, resolveBoardValue, selectedBoardValue ]);

    useEffect(() => {
        if (initialBoardValue) {
            fetchTableData();
        }
    }, [ fetchTableData, initialBoardValue ]);

    const fetchTableDataByFilter = useCallback(async () => {
        currentPagination.current = {
            ...currentPagination.current,
            pageIndex: 1,
        };
        await fetchTableData();
    }, [ fetchTableData ]);

    const handleTableChange = useCallback(
        (pagination: any) => {
            currentPagination.current = {
                pageIndex: pagination.current,
                pageSize: pagination.pageSize || currentPagination.current.pageSize,
            };
            fetchTableData();
        },
        [ fetchTableData ]
    );

    const handleAdd = useCallback(() => {
        if (boardId == null || !clubDeployVersion) {
            message.warning('请选择需要配置的版块');
            return;
        }
        setDrawerState({
            visible: true,
            record: null,
        });
    }, [ boardId, clubDeployVersion ]);

    const handleEdit = useCallback(
        (record: TagSettingListItem) => {
            if (boardId == null || !clubDeployVersion) {
                message.warning('请选择需要配置的版块');
                return;
            }
            setDrawerState({
                visible: true,
                record,
            });
        },
        [ boardId, clubDeployVersion ]
    );

    const handleRemove = useCallback(
        (record: TagSettingListItem) => {
            if (boardId == null || !clubDeployVersion) {
                message.warning('请选择需要配置的版块');
                return;
            }
            Modal.confirm({
                title: '删除确认',
                content: `确定删除标签「${record.name}」吗？`,
                onOk: async () => {
                    const { code, msg } = await removeTagSetting({ boardId, id: record.id }, clubDeployVersion);
                    if (code === 0) {
                        message.success('删除成功');
                        fetchTableData();
                    } else {
                        message.error(msg || '删除失败');
                    }
                },
            });
        },
        [ boardId, clubDeployVersion, fetchTableData ]
    );

    const handleDownload = useCallback(async () => {
        if (boardId == null || !clubDeployVersion) {
            message.warning('请选择需要配置的版块');
            return;
        }
        const values = await filterbox.validate();
        downloadClubTagSettingList(
            {
                boardId,
                name: values.name?.trim(),
                pageIndex: 1,
                pageSize: 100000,
            },
            clubDeployVersion
        );
    }, [ boardId, clubDeployVersion, filterbox ]);

    const columns: ColumnsType<TagSettingListItem> = useMemo(() => {
        return [
            {
                title: '标签ID',
                dataIndex: 'id',
                width: 120,
            },
            {
                title: '标签名称',
                dataIndex: 'name',
                width: 200,
            },
            {
                title: '充值条件',
                dataIndex: 'chargeType',
                render: (_v, record) => getRechargeTypeStr(record),
            },
            {
                title: '创建时间',
                dataIndex: 'createdAt',
                width: 200,
                render: value => simpleTime(value),
            },
            {
                title: '操作',
                dataIndex: 'operation',
                fixed: 'right',
                width: 160,
                render: (_value, record) => {
                    return (
                        <ActionGroup
                            btns={[
                                {
                                    title: '',
                                    icon: '',
                                    hidden: !hasFunctionPermit('btn__update__club_tag_setting'),
                                    props: {
                                        type: 'link',
                                        children: '编辑',
                                        onClick: () => handleEdit(record),
                                    },
                                },
                                {
                                    title: '',
                                    icon: '',
                                    hidden: !hasFunctionPermit('btn__delete__club_tag_setting'),
                                    props: {
                                        type: 'link',
                                        danger: true,
                                        children: '删除',
                                        onClick: () => handleRemove(record),
                                    },
                                },
                            ]}
                        />
                    );
                },
            },
        ];
    }, [ handleEdit, handleRemove, hasFunctionPermit ]);

    const tableTools = useMemo(() => {
        return (
            <Permissions value="btn__add__club_tag_setting">
                <Button type="primary" onClick={handleAdd}>
                    新增标签
                </Button>
            </Permissions>
        );
    }, [ handleAdd ]);

    const handleFormChange = useCallback(async () => {
        const values = await filterbox.validate();
        const boardValue: string | undefined = values.boardId ?? selectedBoardValue;
        const { deploy, board } = resolveBoardValue(boardValue);
        if (deploy && board) {
            setBoardId(board);
            setClubDeployVersion(deploy);
        }
        fetchTableData();
    }, [ filterbox, resolveBoardValue, selectedBoardValue, fetchTableData ]);

    return (
        <>
            <FilterBox
                context={filterbox}
                query={fetchTableDataByFilter}
                tableName="clubUserTagSetting"
                initialValues={{
                    boardId: initialBoardValue,
                }}
            >
                <FilterBox.Item name="boardId" label="所属版块" rules={[ { required: true, message: '请选择版块' } ]}>
                    <Select placeholder="请选择版块" onChange={handleFormChange}>
                        {clubBoardOptions.map(group =>
                            group.children?.length ? (
                                <Select.OptGroup label={group.label} key={group.value}>
                                    {group.children.map(item => (
                                        <Select.Option value={item.value} key={item.value}>
                                            {item.label}
                                        </Select.Option>
                                    ))}
                                </Select.OptGroup>
                            ) : null
                        )}
                    </Select>
                </FilterBox.Item>
                <FilterBox.Item name="name" label="标签名称">
                    <Input placeholder="请输入标签名称" allowClear maxLength={30} />
                </FilterBox.Item>
            </FilterBox>

            <Q1Table
                rowKey="id"
                tableName="operation@page__list__club_user_tagSetting"
                columns={columns}
                dataSource={tableData.data}
                loading={loading}
                tableTools={tableTools}
                pagination={{
                    showSizeChanger: true,
                    showQuickJumper: true,
                    current: currentPagination.current.pageIndex,
                    pageSize: currentPagination.current.pageSize,
                    total: tableData.total,
                    showTotal: () => `共${tableData.total}条`,
                }}
                onChange={handleTableChange}
                download={hasFunctionPermit('btn__download__club_tag_setting') ? handleDownload : undefined}
            />

            {clubDeployVersion && (
                <Create
                    visible={drawerState.visible}
                    clubBoardOptions={clubBoardOptions}
                    data={drawerState.record}
                    boardId={boardId}
                    clubDeployVersion={clubDeployVersion}
                    onClose={() => {
                        setDrawerState({
                            visible: false,
                            record: null,
                        });
                    }}
                    onSuccess={() => {
                        fetchTableData();
                    }}
                />
            )}
        </>
    );
};

const TagSettingPageWrapper: React.FC = () => {
    const { clubBoardOptions } = usePremitClubBoard();
    if (!clubBoardOptions.length) {
        return (
            <Spin size="large">
                <div style={{ height: '100vh' }} />
            </Spin>
        );
    }
    return <TagSettingPage clubBoardOptions={clubBoardOptions} />;
};

export default TagSettingPageWrapper;
