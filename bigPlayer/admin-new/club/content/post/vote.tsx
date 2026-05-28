import { inject, observer } from 'mobx-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Descriptions, Select } from 'antd';
import { ColumnsType, FilterBox, Q1Table, Q1TablePropsType } from 'q1-antd';
import moment from 'moment';

import { useContentHistory, useContentParams, useContentTab, useContentTabSearch } from '@/context';
import { quickPickTimeRange, simpleTime } from '@/utils/date';
import { StoreType } from '@/store/config';
import Permissions from '@/layouts/components/permissions';
import RangePicker from '@/components/RangePicker';
import { getPostVoteHref, getVoteDetails, getVoteRecord } from '@/api/club';

import { paginationType } from '@ts/common';
import { CLUB_DEPLOY_VERSION, VoteDetailItem, VoteDetailResponse, VoteRecordQuery } from '@ts/club';

require('./vote.less');

const defaultPagination: paginationType = {
    pageIndex: 1,
    pageSize: 10,
};

type BaseOption = {
    label: string;
    value: number;
};

interface VoteDetailProps {}

interface VoteDetailPropsMobx
    extends VoteDetailProps,
        Pick<StoreType, 'UIState' | 'Permit' | 'Game' | 'GameContext' | 'User'> {}

const VoteDetail: React.FC<VoteDetailProps> = function VoteDetail(props: VoteDetailProps) {
    const { id: postId } = useContentParams();
    const urlSearch = useContentTabSearch();
    const boardId = urlSearch.get('boardId');
    const topic = urlSearch.get('topic');
    const clubDeployVersion = urlSearch.get('clubDeployVersion') as CLUB_DEPLOY_VERSION;
    const tab = useContentTab();
    const history = useContentHistory();

    const { UIState } = props as VoteDetailPropsMobx;

    // 筛选
    const initialValues = {
        itemId: '',
    };
    const filterers = FilterBox.useFilterBox();
    const [ loading, setLoading ] = useState(false);
    const currentPagination = useRef(defaultPagination); // 分页

    // 数据概况
    const [ voteDetails, setVoteDetails ] = useState<Array<VoteDetailItem>>([]);

    // 投票人员信息
    const [ tableData, setTableData ] = useState<{
        total: number;
        data: Array<VoteDetailResponse>;
    }>({
        data: [],
        total: 0,
    });

    const voteDetailsDescription = useMemo(() => {
        const _voteDetailsDescription: Array<{
            label: string;
            value: string | number;
        }> = [];
        let allParticipationItem = {
            label: '',
            value: 0,
        };
        let allParticipations = 0;
        voteDetails.forEach(item => {
            if (item.itemId === 0) {
                allParticipationItem = {
                    label: '总参与人数',
                    value: item.participation,
                };
            } else {
                allParticipations += item.participation;
            }
        });
        voteDetails.forEach((item, idx) => {
            if (item.itemId !== 0) {
                const percent =
                    item.participation === 0 ? 0 : ((item.participation / allParticipations) * 100).toFixed(1);
                _voteDetailsDescription.push({
                    label: `选项${idx + 1}：${item.itemName}`,
                    value: `${item.participation}(${percent}%)`,
                });
            }
        });
        _voteDetailsDescription.unshift(allParticipationItem);
        return _voteDetailsDescription;
    }, [ voteDetails ]);

    const voteOptions = useMemo(() => {
        const _voteOptions: Array<BaseOption> = [];
        (voteDetails || []).forEach(item => {
            if (item.itemId > 0) {
                _voteOptions.push({
                    label: item.itemName,
                    value: item.itemId,
                });
            }
        });
        return _voteOptions;
    }, [ voteDetails ]);

    // 获取概况
    const fetchVoteDetails = useCallback(async () => {
        const { data } = await getVoteDetails(
            {
                boardId: boardId!,
                postId,
            },
            clubDeployVersion!
        );
        if (data) {
            setVoteDetails(data);
        }
    }, [ boardId, clubDeployVersion, postId ]);

    const fetchVoteRecord = useCallback(async () => {
        setLoading(true);
        try {
            const { itemId, actionTime } = await filterers.validate();
            const { data, total = 0 } = await getVoteRecord(
                {
                    ...(itemId ? { itemId } : {}),
                    ...(actionTime && actionTime.length > 0
                        ? {
                              startTime: moment(actionTime[0]).valueOf(),
                              endTime: moment(actionTime[1]).valueOf(),
                          }
                        : {}),
                    boardId: boardId!,
                    postId,
                    ...currentPagination.current,
                },
                clubDeployVersion!
            );

            if (data) {
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
    }, [ boardId, clubDeployVersion, filterers, postId ]);

    useEffect(() => {
        fetchVoteDetails();
        fetchVoteRecord();
    }, [ fetchVoteDetails, fetchVoteRecord ]);

    // 查询
    function fetchTableDataByFilter() {
        currentPagination.current = {
            ...currentPagination.current,
            pageIndex: 1,
        };
        fetchVoteRecord();
    }

    // 分页
    const handleChange = useCallback(
        (nextPagination: any, filters: any, sorter: any) => {
            currentPagination.current = {
                pageIndex: nextPagination.current,
                pageSize: nextPagination.pageSize || defaultPagination.pageSize,
            };
            fetchVoteRecord();
        },
        [ fetchVoteRecord ]
    );

    // 导出
    const [ exportLoading, setExportLoading ] = useState(false);

    const exportHandle = useCallback(async () => {
        setExportLoading(true);
        try {
            const { itemId, actionTime } = await filterers.validate();
            const query: VoteRecordQuery = {
                boardId: boardId!,
                postId,
                ...(itemId ? { itemId } : {}),
                ...(actionTime
                    ? {
                          startTime: moment(actionTime[0]).valueOf(),
                          endTime: moment(actionTime[1]).valueOf(),
                      }
                    : {
                          startTime: moment().subtract(1, 'weeks').valueOf(),
                          endTime: moment().valueOf(),
                      }),
                pageIndex: 1,
                pageSize: 10e4,
            };
            await getPostVoteHref({ ...query, clubDeployVersion: clubDeployVersion! });
        } catch (e) {
            console.log(e);
        } finally {
            setExportLoading(false);
        }
    }, [ boardId, clubDeployVersion, filterers, postId ]);

    // 表格数据
    const tableProps: Q1TablePropsType<any> = useMemo(() => {
        const tableTools = (
            <>
                <Permissions value="btn__down__vote_detail" name="导出">
                    <Button type="primary" onClick={exportHandle} loading={exportLoading}>
                        导出
                    </Button>
                </Permissions>
            </>
        );
        return {
            columns: [
                {
                    title: '序号',
                    dataIndex: 'id',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                    width: 80,
                },
                {
                    title: '昵称',
                    dataIndex: 'nickName',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                    width: 140,
                },
                {
                    title: '冰川通行证ID',
                    dataIndex: 'userId',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                    width: 140,
                },
                {
                    title: '冰川通行证名称',
                    dataIndex: 'userName',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                    width: 140,
                },
                {
                    title: '投票时间',
                    dataIndex: 'createTime',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                    render: (v: string) => {
                        return <span>{v ? simpleTime(v) : v}</span>;
                    },
                    width: 160,
                },
                {
                    title: '投票选项',
                    dataIndex: 'itemName',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                },
            ] as ColumnsType<any>,

            dataSource: tableData.data,
            rowKey: 'id',
            tableName: `operation@page__list__club_content_post_vote`,
            loading,
            scrollToFirstRowOnChange: true,
            pagination: {
                showSizeChanger: true,
                current: currentPagination.current.pageIndex,
                pageSize: currentPagination.current.pageSize,
                total: tableData.total,
                showTotal: () => `共${tableData.total}条`,
            },
            tableTools,
            onChange: handleChange,
        };
    }, [ exportHandle, exportLoading, tableData.data, tableData.total, loading, handleChange ]);

    return (
        <div className="vote-detail-page">
            <div className="vote-detail-header vote-detail-content">
                <Button
                    type="primary"
                    onClick={() => {
                        history.push(UIState.getTabUrl('/game/club/content/post'));
                        UIState.closeTab(tab);
                    }}
                >
                    返回列表
                </Button>
                <div className="vote-detail-title">
                    投票主题：<span>{topic}</span>
                </div>
            </div>
            <div className="vote-detail-overview vote-detail-content">
                <Descriptions title="数据概况" bordered layout="vertical" column={{ lg: 6, sm: 2 }}>
                    {voteDetailsDescription.map((item, index: number) => {
                        return (
                            <Descriptions.Item key={index} label={item.label}>
                                {item.value}
                            </Descriptions.Item>
                        );
                    })}
                </Descriptions>
            </div>
            <div className=" vote-detail-content">
                <div className="sub-title">投票人员信息</div>
                <FilterBox
                    context={filterers}
                    query={fetchTableDataByFilter}
                    tableName="clubVoteTable"
                    showAdvancedFilter={false}
                    initialValues={initialValues}
                    key={JSON.stringify(initialValues)} // 为了刷新form
                    onValuesChange={(v, vs) => {
                        console.log('onValuesChange', v, vs);
                    }}
                >
                    <FilterBox.Item name="itemId" label="投票选项">
                        <Select
                            options={[
                                {
                                    label: '不限',
                                    value: '',
                                },
                                ...voteOptions,
                            ]}
                        ></Select>
                    </FilterBox.Item>
                    <FilterBox.Item name="actionTime" label="提交时间">
                        <RangePicker showTime ranges={quickPickTimeRange} />
                    </FilterBox.Item>
                </FilterBox>
                <div>
                    <Q1Table {...tableProps} />
                </div>
            </div>
        </div>
    );
};

export default inject('UIState', 'Permit', 'GameContext', 'User', 'Club')(observer(VoteDetail));
