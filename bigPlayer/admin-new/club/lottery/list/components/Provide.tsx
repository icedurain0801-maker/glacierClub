import { Button, Descriptions, Input, message, Modal, Select, Space, Spin } from 'antd';
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ColumnsType, Q1Table, Q1TablePropsType } from 'q1-antd';
import type { TableRowSelection } from 'antd/es/table/interface';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { map, uniq } from 'lodash';

import { useContentDialogContainer } from '@/context';
import {
    confirmLottery,
    downloadLotteryUserList,
    getLotteryAwardsList,
    getLotteryPrizepoolUser,
    updateLotteryRecord,
} from '@/api/club';
import { useColumnSearch } from '@/hooks/table/useColumnSearch';

import {
    AwardsListParamsAddUser,
    CLUB_DEPLOY_VERSION,
    LotteryAwardsListParams,
    LotteryListResponse,
    LotteryProvideListResponse,
    LotteryProvideUserResponse,
    UPDATE_LOTTERY_TYPE_ENUM,
} from '@ts/club';
import { paginationType } from '@ts/common';
import { DOWNLOAD_PAGESIZE, FeedbackResponseType2 } from '@ts/api';
import './provide.less';

interface LotteryProvideProps {
    data: LotteryListResponse;
    boardId: number;
    visible: boolean;
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    onOk: () => void;
    onCancel: () => void;
}

const defaultPagination: paginationType = {
    pageIndex: 1,
    pageSize: 20,
};

function LotteryProvide(props: LotteryProvideProps) {
    const { boardId, data, visible, onOk, onCancel, clubDeployVersion } = props;
    const getContainer = useContentDialogContainer();
    const tableEl = useRef<HTMLDivElement>(null);
    const [ provideLoading, setProvideLoading ] = useState(false);
    const [ currentPagination, setCurrentPagination ] = useState(defaultPagination);
    const [ loading, setLoading ] = useState(false);
    const [ allTableData, setAllTableData ] = useState<LotteryProvideListResponse[]>([]);
    const [ tableData, setTableData ] = useState({} as FeedbackResponseType2<LotteryProvideListResponse[]>);
    const [ selectedRow, setSelectedRow ] = useState<LotteryProvideListResponse[]>([]);
    const [ userOptions, setUserOptions ] = useState<LotteryProvideUserResponse[]>([]);
    const [ selectVal, setSelectVal ] = useState<number[]>([]);
    const [ searchUserValue, setSearchUserValue ] = useState('');
    const [ tableFilters, setTableFilters ] = useState<Record<string, string[]>>({});
    const [ tableSorter, setTableSorter ] = useState<{ field?: string; order?: 'ascend' | 'descend' }>();
    const { getColumnSearchProps } = useColumnSearch();
    const [ operateLoading, setOperateLoading ] = useState(false);

    const applyTableData = useCallback(
        (
            list: LotteryProvideListResponse[],
            paginationOverride?: paginationType,
            filtersOverride?: Record<string, string[]>,
            sorterOverride?: { field?: string; order?: 'ascend' | 'descend' }
        ) => {
            const filters = filtersOverride ?? tableFilters;
            const sorter = sorterOverride ?? tableSorter;
            let filteredData = Array.isArray(list) ? [ ...list ] : [];
            Object.entries(filters || {}).forEach(([ key, value ]) => {
                const values = Array.isArray(value) ? value : value !== undefined ? [ value ] : [];
                const keywords = values
                    .map(v => String(v ?? ''))
                    .flatMap(v => v.split(/[,，]/))
                    .map(v => v.trim())
                    .filter(Boolean);
                if (keywords.length) {
                    filteredData = filteredData.filter(item => {
                        const target = item?.[key as keyof LotteryProvideListResponse];
                        if (target === undefined || target === null) {
                            return false;
                        }
                        const targetStr = String(target).toLowerCase();
                        return keywords.some(v => targetStr.includes(String(v ?? '').toLowerCase()));
                    });
                }
            });
            if (sorter?.field && sorter?.order) {
                const direction = sorter.order === 'ascend' ? 1 : -1;
                filteredData = [ ...filteredData ].sort((a: any, b: any) => {
                    const av = a?.[sorter.field as keyof LotteryProvideListResponse];
                    const bv = b?.[sorter.field as keyof LotteryProvideListResponse];
                    if (av === undefined || av === null) {
                        return -1 * direction;
                    }
                    if (bv === undefined || bv === null) {
                        return Number(direction);
                    }
                    if (typeof av === 'number' && typeof bv === 'number') {
                        return (av - bv) * direction;
                    }
                    return String(av).localeCompare(String(bv)) * direction;
                });
            }
            const pagination = paginationOverride || currentPagination;
            const total = filteredData.length;
            const maxPage = Math.max(1, Math.ceil(total / pagination.pageSize));
            const safePagination = {
                ...pagination,
                pageIndex: Math.min(pagination.pageIndex, maxPage),
            };
            setCurrentPagination(safePagination);
            setTableData({
                data: filteredData,
                total,
            });
        },
        [ currentPagination, tableFilters, tableSorter ]
    );

    const getUserOption = useCallback(async () => {
        const { data: res } = await getLotteryPrizepoolUser({ id: data?.id, boardId }, clubDeployVersion);
        if (res) {
            setUserOptions(res || []);
        }
    }, [ boardId, clubDeployVersion, data ]);

    const handleOk = async () => {
        try {
            setProvideLoading(true);
            Modal.confirm({
                getContainer,
                title: '系统提示',
                content: (
                    <div>
                        <p className="recycleBin__delete__text">确认奖励名单是否正确？确认后会自动发放奖励</p>
                    </div>
                ),
                onOk: async () => {
                    const addUser = (tableData?.data ?? []).map(item => ({
                        userId: item.userId,
                        nickName: item.nickName,
                        label: item.label,
                        type: UPDATE_LOTTERY_TYPE_ENUM.Add,
                    })) as AwardsListParamsAddUser[];
                    const { code, msg } = await confirmLottery(
                        { boardId },
                        { boardId, id: data.id, addUser },
                        clubDeployVersion
                    );
                    if (code === 0) {
                        message.success(msg);
                        onOk();
                    } else {
                        message.error(msg);
                    }
                },
                onCancel: () => {},
            });
        } finally {
            setProvideLoading(false);
        }
    };

    const selectChange = useCallback(val => {
        setSelectVal(val);
    }, []);

    const fetchTableData = useCallback(async () => {
        setLoading(true);
        try {
            const pagination = currentPagination;
            const params: LotteryAwardsListParams = {
                lotteryId: data?.id,
                boardId,
            };
            const { code, data: result, msg } = await getLotteryAwardsList(params, clubDeployVersion);
            if (code === 0) {
                setAllTableData(result || []);
                applyTableData(result || [], pagination);
            } else {
                message.error(msg);
            }
        } finally {
            setLoading(false);
        }
    }, [ applyTableData, boardId, clubDeployVersion, currentPagination, data?.id ]);

    const handleChange = useCallback(
        (nextPagination: any, filters: any, sorter: any) => {
            const pageOption = {
                pageIndex: nextPagination.current,
                pageSize: nextPagination.pageSize || defaultPagination.pageSize,
            };
            setTableFilters(filters || {});
            setTableSorter({ field: sorter?.field, order: sorter?.order });
            applyTableData(allTableData, pageOption, filters || {}, { field: sorter?.field, order: sorter?.order });
            setSelectedRow([]);
        },
        [ allTableData, applyTableData ]
    );

    const updateUser = useCallback(
        async (type: UPDATE_LOTTERY_TYPE_ENUM) => {
            const isAdd = type === UPDATE_LOTTERY_TYPE_ENUM.Add;
            if (isAdd && (tableData?.total || 0) + selectVal?.length > data?.count) {
                message.warning('获奖人数不正确，请重新编辑');
                return;
            }
            setOperateLoading(true);
            try {
                const query = { boardId };
                const params = {
                    boardId,
                    lotteryId: data?.id,
                    type,
                    userIds: isAdd ? selectVal : map(selectedRow, 'userId'),
                };
                const { code, msg } = await updateLotteryRecord(query, params, clubDeployVersion);
                if (code === 0) {
                    fetchTableData();
                    if (isAdd) {
                        setSelectVal([]);
                    } else {
                        setSelectedRow([]);
                    }
                } else {
                    message.error(msg || '操作失败');
                }
            } finally {
                setOperateLoading(false);
            }
        },
        [ boardId, clubDeployVersion, data?.count, data?.id, fetchTableData, selectVal, selectedRow, tableData?.total ]
    );

    useEffect(() => {
        if (visible) {
            getUserOption();
            fetchTableData();
        } else {
            setSelectVal([]);
            setSelectedRow([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ visible ]);

    const rowSelection: TableRowSelection<LotteryProvideListResponse> | undefined = useMemo(() => {
        return {
            type: 'checkbox',
            selectedRowKeys: selectedRow.map(x => x.userId),
            columnWidth: 50,
            onChange: (key: React.Key[], rows: LotteryProvideListResponse[]) => {
                setSelectedRow(rows);
            },
        };
    }, [ selectedRow ]);

    const download = useCallback(async () => {
        if (allTableData?.length) {
            const params: LotteryAwardsListParams = {
                id: data?.id,
                boardId,
                addUser: [],
                pageSize: DOWNLOAD_PAGESIZE,
                pageIndex: 1,
            };
            await downloadLotteryUserList(boardId, params, clubDeployVersion);
        } else {
            message.warning('暂无数据可导出');
        }
    }, [ allTableData?.length, data?.id, boardId, clubDeployVersion ]);

    const tableProps: Q1TablePropsType<LotteryProvideListResponse> = useMemo(() => {
        const columns: ColumnsType<LotteryProvideListResponse> = [
            {
                ...getColumnSearchProps('userId', { splitByComma: true }),
                title: '用户ID',
                dataIndex: 'userId',
                width: 110,
            },
            {
                ...getColumnSearchProps('nickName', { splitByComma: true }),
                title: '昵称',
                dataIndex: 'nickName',
                width: 180,
                render(v, r) {
                    return r?.floor ? (
                        <div className="nickname-column">
                            {v}
                            <div className="floor">{r.floor}F</div>
                        </div>
                    ) : (
                        v
                    );
                },
            },
            {
                ...getColumnSearchProps('label', { splitByComma: true }),
                title: '用户标签',
                dataIndex: 'label',
                width: 160,
            },
            {
                ...getColumnSearchProps('passportId', { splitByComma: true }),
                title: '通行证ID',
                dataIndex: 'passportId',
                width: 110,
            },
        ];
        return {
            columns,
            dataSource: tableData.data,
            rowKey: 'userId',
            tableName: `operation@page__list__club_lottery@${'provide'}`,
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
            rowSelection: rowSelection,
            download,
        };
    }, [
        currentPagination.pageIndex,
        currentPagination.pageSize,
        download,
        handleChange,
        loading,
        rowSelection,
        tableData.data,
        tableData.total,
        getColumnSearchProps,
    ]);

    const normalizeKeywords = useCallback((value: string) => {
        return value
            .split(/[,，]/)
            .map(v => v.trim())
            .filter(Boolean);
    }, []);

    const matchUserByKeywords = useCallback(
        (keywords: string[], user: LotteryProvideUserResponse, labelText?: string) => {
            if (!keywords.length) {
                return true;
            }
            const labelLower = labelText?.toLowerCase() || '';
            return keywords.some(keyword => {
                if (!keyword) {
                    return false;
                }
                const lower = keyword.toLowerCase();
                const isNumber = /^\d+$/.test(keyword);
                if (isNumber) {
                    return (
                        String(user.userId) === keyword ||
                        String(user.passportId ?? '') === keyword ||
                        labelLower.includes(keyword)
                    );
                }
                return user.nickName?.toLowerCase().includes(lower) || labelLower.includes(lower);
            });
        },
        []
    );

    const onSearch = useCallback((value: string) => {
        setSearchUserValue(value);
    }, []);

    const handleSelectEnter = useCallback(() => {
        const keywords = normalizeKeywords(searchUserValue);
        if (!keywords.length) {
            return;
        }
        const matchedOptions =
            userOptions?.filter(
                opt =>
                    !opt.isExist &&
                    matchUserByKeywords(keywords, opt, `${opt.userId}-${opt.nickName}(${opt.passportId || '-'})`)
            ) || [];
        const matchedIds = matchedOptions.map(opt => opt.userId);
        const unmatchedKeywords = keywords.filter(
            kw =>
                !userOptions?.some(opt =>
                    matchUserByKeywords([ kw ], opt, `${opt.userId}-${opt.nickName}(${opt.passportId || '-'})`)
                )
        );
        if (unmatchedKeywords.length) {
            message.error(`输入：${unmatchedKeywords.join(',')} 不存在`);
        }
        if (!matchedIds.length) {
            return;
        }
        setSelectVal(prev => uniq([ ...prev, ...matchedIds ]));
        setSearchUserValue('');
    }, [ matchUserByKeywords, normalizeKeywords, searchUserValue, userOptions ]);

    return (
        <div className="lottery-provide-page">
            <Modal
                width={600}
                style={{ top: '20px' }}
                getContainer={useContentDialogContainer()}
                title="奖励发放"
                visible={visible}
                onCancel={onCancel}
                footer={[
                    <Button key="back" onClick={onCancel}>
                        取消
                    </Button>,
                    <Button key="submit" disabled={!tableData.data?.length} type="primary" onClick={handleOk}>
                        确定
                    </Button>,
                ]}
            >
                <Spin spinning={provideLoading}>
                    <Descriptions size="small" bordered column={1}>
                        <Descriptions.Item label="活动ID">{data?.id}</Descriptions.Item>
                        <Descriptions.Item label="活动名称">{data?.name}</Descriptions.Item>
                    </Descriptions>
                    <h3 style={{ margin: '15px 0' }}>获奖名单</h3>
                    <Space
                        style={{ marginBottom: '25px', width: '100%', justifyContent: 'space-between' }}
                        align="start"
                    >
                        <div>
                            <Select
                                showSearch
                                searchValue={searchUserValue}
                                value={selectVal}
                                className="input-width"
                                style={{ marginRight: '15px' }}
                                mode="multiple"
                                maxTagCount={3}
                                onChange={val => {
                                    selectChange(val);
                                    setSearchUserValue('');
                                }}
                                onSearch={onSearch}
                                onKeyDown={e => {
                                    if (e.key !== 'Enter') {
                                        return;
                                    }
                                    handleSelectEnter();
                                }}
                                filterOption={(input, option: any) => {
                                    const label = (option?.label || '').toString();
                                    const user = option?.user as LotteryProvideUserResponse;
                                    if (!user) {
                                        return false;
                                    }
                                    const keywords = normalizeKeywords(input);
                                    if (!keywords.length) {
                                        return true;
                                    }
                                    return keywords.some(kw => {
                                        const isNum = /^\d+$/.test(kw);
                                        if (isNum) {
                                            return String(user.userId) === kw || String(user.passportId ?? '') === kw;
                                        }
                                        return (
                                            user.nickName?.toLowerCase().includes(kw.toLowerCase()) ||
                                            label.toLowerCase().includes(kw.toLowerCase())
                                        );
                                    });
                                }}
                                allowClear
                            >
                                {userOptions?.map(x => {
                                    const optionLabel = `${x.userId}-${x.nickName}(${x.passportId || '-'})`;
                                    return (
                                        <Select.Option
                                            key={x.userId}
                                            value={x.userId}
                                            label={optionLabel}
                                            user={x}
                                            disabled={x.isExist}
                                        >
                                            {optionLabel}
                                        </Select.Option>
                                    );
                                })}
                            </Select>
                            <Button
                                type="primary"
                                loading={operateLoading}
                                icon={<PlusOutlined />}
                                onClick={() => updateUser(UPDATE_LOTTERY_TYPE_ENUM.Add)}
                                disabled={selectVal.length === 0}
                            >
                                添加用户
                            </Button>
                        </div>
                        <Button
                            loading={operateLoading}
                            icon={<DeleteOutlined />}
                            disabled={!selectedRow?.length}
                            onClick={() => updateUser(UPDATE_LOTTERY_TYPE_ENUM.Delete)}
                        >
                            移除用户
                        </Button>
                    </Space>

                    <div ref={tableEl}>
                        <Q1Table {...tableProps} scroll={{ y: 380 }} className="lottery-provide-table" />
                    </div>
                </Spin>
            </Modal>
        </div>
    );
}

export default LotteryProvide;
