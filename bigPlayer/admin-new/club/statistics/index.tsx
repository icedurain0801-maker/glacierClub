import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FilterBox, Q1Table, ColumnsType } from 'q1-antd';
import { Descriptions, Form, InputNumber, Select, Space, Spin } from 'antd';
import { get } from 'lodash';
import { useObserver } from 'mobx-react';
import moment from 'moment';
import { Rule } from 'antd/lib/form';

import { useContentPermissionFn, useStore } from '@/context';
import { getStatisticsDaily, getStatisticsDailyHerf, getStatisticsSummary } from '@/api/club';
import { quickPickTimeRange } from '@/utils/date';
import useSyncState from '@/components/UseSyncState';
import RangePicker from '@/components/RangePicker';
import { usePremitClubBoard } from '@/pages/club/board/hooks/useClubBoardOptions';

import { BOARD_PERMIT_SEPARATE, StatisticsDailyItem, StatisticsSummaryRes } from '@ts/club';
import './index.less';

const ContentMemo = React.memo;
const MAX_CREATE_DAY = 9999;

function Statistics() {
    const { hasFunctionPermit } = useContentPermissionFn();

    const filterbox = FilterBox.useFilterBox();
    const [ form ] = Form.useForm();

    const { clubBoardOptions } = usePremitClubBoard();

    // 表格数据源
    const [ data, setData ] = useState<StatisticsDailyItem[]>([]);
    const [ loading, setLoading ] = useState(false);

    // 汇总数据源
    const [ statisticsSummary, setStatisticsSummary ] = useState<StatisticsSummaryRes>({} as StatisticsSummaryRes);

    // form 表单查询
    let [ initVal, setInitVal ] = useState({
        boardId: get(clubBoardOptions, '0.children.0.value'),
        actionTime: [
            moment().set({ hour: 0, minute: 0, second: 0 }),
            moment().set({ hour: 23, minute: 59, second: 59 }),
        ],
        minCreateDays: undefined,
        maxCreateDays: undefined,
    });

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
            const { boardId: boardIdOrg, actionTime, minCreateDays, maxCreateDays } = await filterbox.validate();
            const { pageSize, current } = getPagination();
            const [ clubDeployVersion, boardId ] = boardIdOrg.split(BOARD_PERMIT_SEPARATE);
            let params = {
                boardId,
                minCreateDays: minCreateDays || 0,
                maxCreateDays: maxCreateDays || MAX_CREATE_DAY,
                ...(actionTime
                    ? {
                          beginDate: actionTime[0].format('YYYY-MM-DD'),
                          endDate: actionTime[1].format('YYYY-MM-DD'),
                      }
                    : {}),
            };
            const { data: _statisticsSummary = {} } = await getStatisticsSummary(params, clubDeployVersion);
            setStatisticsSummary(_statisticsSummary as StatisticsSummaryRes);
            let { data, total = 0 } = await getStatisticsDaily(
                { ...params, pageSize, pageIndex: current },
                clubDeployVersion
            );
            data = data ?? [];
            if ((data || [])?.length === 0 && current !== 1) {
                setpagination({ ...getPagination(), current: 1 });
                fetchTableData();
            }
            let _data = data.map((item, idx: number) => ({
                ...item,
                key: (current - 1) * pageSize + idx,
            }));
            setData(_data as StatisticsDailyItem[]);
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

    const columns: ColumnsType<StatisticsDailyItem> = useMemo(() => {
        return [
            {
                dataIndex: 'statisticsDate',
                title: '日期',
                switch: 1,
                align: 'center',
                width: 200,
                render: v => {
                    if (!v) {
                        return '';
                    }
                    const value = String(v);
                    return value.includes('-') ? value : `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`;
                },
            },
            {
                dataIndex: 'gameActiveAccountCount',
                title: '游戏活跃账号数',
                switch: 1,
                align: 'center',
                width: 200,
            },
            {
                dataIndex: 'pv',
                title: '社区访问次数',
                switch: 1,
                align: 'center',
                width: 200,
            },
            {
                dataIndex: 'uv',
                title: '社区访问账号数',
                switch: 1,
                align: 'center',
                width: 200,
            },
            {
                dataIndex: 'actiCount',
                title: '社区活跃账号数',
                switch: 1,
                align: 'center',
                width: 200,
            },
            {
                dataIndex: 'memberActinums',
                title: '会员中心活跃账号数量',
                switch: 1,
                align: 'center',
                width: 200,
            },
            {
                dataIndex: 'actiRate',
                title: '社区活跃率',
                switch: 1,
                align: 'center',
                width: 200,
            },
            // 以上为新增
            {
                dataIndex: 'registerCount',
                title: '每日总新增用户数',
                switch: 1,
                align: 'center',
                width: 200,
            },
            {
                dataIndex: 'dailyactinums',
                title: '每日总新增活跃数',
                switch: 1,
                align: 'center',
                width: 200,
            },
            {
                dataIndex: 'dailyactiRate',
                title: '每日总新增用户活跃率',
                switch: 1,
                align: 'center',
                width: 200,
            },
            {
                dataIndex: 'postCount',
                title: '每日发帖数（帖子）',
                switch: 1,
                align: 'center',
                width: 200,
            },
            {
                dataIndex: 'dynamicsCount',
                title: '每日总发帖数（动态）',
                switch: 1,
                align: 'center',
                width: 200,
            },
            {
                dataIndex: 'commontCount',
                title: '每日总评论数',
                switch: 1,
                align: 'center',
                width: 200,
            },
            {
                dataIndex: 'likeCount',
                title: '每日总点赞数',
                switch: 1,
                align: 'center',
                width: 200,
            },
            {
                dataIndex: 'userPostCount',
                title: '每日总发帖用户数（帖子）',
                switch: 1,
                align: 'center',
                width: 200,
            },
            {
                dataIndex: 'userDynamicsCount',
                title: '每日总发帖用户数（动态）',
                switch: 1,
                align: 'center',
                width: 200,
            },
            {
                dataIndex: 'userCommentCount',
                title: '每日总评论用户数',
                switch: 1,
                align: 'center',
                width: 200,
            },
            {
                dataIndex: 'userLikeCount',
                title: '每日总点赞用户数',
                switch: 1,
                align: 'center',
                width: 200,
            },
        ];
    }, []);

    // 导出
    const download = useCallback(async () => {
        const { boardId: boardIdOrg, actionTime, minCreateDays, maxCreateDays } = await filterbox.validate();
        const [ clubDeployVersion, boardId ] = boardIdOrg.split(BOARD_PERMIT_SEPARATE);
        let params = {
            pageSize: 10e4,
            pageIndex: 1,
            boardId,
            minCreateDays: minCreateDays || 0,
            maxCreateDays: maxCreateDays || MAX_CREATE_DAY,
            ...(actionTime
                ? {
                      beginDate: actionTime[0].format('YYYY-MM-DD'),
                      endDate: actionTime[1].format('YYYY-MM-DD'),
                  }
                : {}),
        };
        await getStatisticsDailyHerf(params, clubDeployVersion);
    }, [ filterbox ]);

    const handleChangeBoardId = useCallback(
        async val => {
            const filter = await filterbox.validate();
            setInitVal(filter as any);
            fetchTableData();
        },
        [ fetchTableData, filterbox ]
    );

    const validateSecondInput = useCallback(
        async (_: Rule, value: number | undefined) => {
            const minCreateDaysValue = form.getFieldValue('minCreateDays'); // 获取第一个输入框的值
            if (minCreateDaysValue && value && value < minCreateDaysValue) {
                return Promise.reject('不能小于最小创角天数！');
            }
            return Promise.resolve();
        },
        [ form ]
    );

    const filterNode = useMemo(() => {
        return (
            <FilterBox
                query={fetchTableData}
                tableName="statisticsTable"
                context={filterbox}
                initialValues={initVal}
                form={form}
                key={JSON.stringify(initVal)} // 为了刷新form
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
                <FilterBox.Item name="actionTime" label="日期选择">
                    <RangePicker ranges={quickPickTimeRange} />
                </FilterBox.Item>
                <FilterBox.Item noStyle>
                    <Space align="baseline" style={{ marginRight: 8 }}>
                        <Form.Item name="minCreateDays">
                            <InputNumber
                                min={0}
                                max={MAX_CREATE_DAY}
                                step={1}
                                precision={0}
                                placeholder="最小创角天数"
                                style={{ width: 200 }}
                            />
                        </Form.Item>
                        <span>~</span>
                        <Form.Item
                            name="maxCreateDays"
                            rules={[ { validator: validateSecondInput } ]}
                            dependencies={[ 'minCreateDays' ]}
                        >
                            <InputNumber
                                min={0}
                                max={MAX_CREATE_DAY}
                                step={1}
                                precision={0}
                                placeholder="最大创角天数"
                                style={{ width: 200 }}
                            />
                        </Form.Item>
                    </Space>
                </FilterBox.Item>
            </FilterBox>
        );
    }, [ clubBoardOptions, fetchTableData, filterbox, form, handleChangeBoardId, initVal, validateSecondInput ]);

    const renderStatisticsNode = useMemo(() => {
        return (
            <div className="statistics-summary-box">
                <h3 className="subtitle">累计总数（去重）</h3>
                <Descriptions bordered column={{ xxl: 4, xl: 3, lg: 3, md: 3, sm: 2, xs: 1 }}>
                    <Descriptions.Item label="游戏活跃账号数">
                        {get(statisticsSummary, 'gameActiveAccountCount', '-')}
                    </Descriptions.Item>
                    <Descriptions.Item label="社区访问次数">{get(statisticsSummary, 'pv', '-')}</Descriptions.Item>
                    <Descriptions.Item label="社区访问账号数">{get(statisticsSummary, 'uv', '-')}</Descriptions.Item>
                    <Descriptions.Item label="社区活跃账号数">
                        {get(statisticsSummary, 'actiCount', '-')}
                    </Descriptions.Item>
                    <Descriptions.Item label="会员中心活跃账号数">
                        {get(statisticsSummary, 'memberActinums', '-')}
                    </Descriptions.Item>
                    <Descriptions.Item label="社区活跃率">{get(statisticsSummary, 'actiRate', '-')}</Descriptions.Item>
                    <Descriptions.Item label="每日总新增用户数">
                        {get(statisticsSummary, 'registerCount', '-')}
                    </Descriptions.Item>
                    <Descriptions.Item label="每日总新增活跃数">
                        {get(statisticsSummary, 'dailyactinums', '-')}
                    </Descriptions.Item>
                    <Descriptions.Item label="每日总新增用户活跃率">
                        {get(statisticsSummary, 'dailyactiRate', '-')}
                    </Descriptions.Item>
                </Descriptions>

                <Descriptions bordered column={{ xxl: 4, xl: 3, lg: 3, md: 3, sm: 2, xs: 1 }} style={{ marginTop: 20 }}>
                    <Descriptions.Item label="总发帖数（帖子）">
                        {get(statisticsSummary, 'postCount', '-')}
                    </Descriptions.Item>
                    <Descriptions.Item label="总发帖数（动态）">
                        {get(statisticsSummary, 'dynamicsCount', '-')}
                    </Descriptions.Item>
                    <Descriptions.Item label="总评论数">
                        {get(statisticsSummary, 'commontCount', '-')}
                    </Descriptions.Item>

                    <Descriptions.Item label="总点赞数">{get(statisticsSummary, 'likeCount', '-')}</Descriptions.Item>
                    <Descriptions.Item label="总发帖用户数（帖子）">
                        {get(statisticsSummary, 'userPostCount', '-')}
                    </Descriptions.Item>
                    <Descriptions.Item label="总发帖用户数（动态）">
                        {get(statisticsSummary, 'userDynamicsCount', '-')}
                    </Descriptions.Item>
                    <Descriptions.Item label="总评论用户数">
                        {get(statisticsSummary, 'userCommentCount', '-')}
                    </Descriptions.Item>
                    <Descriptions.Item label="总点赞用户数">
                        {get(statisticsSummary, 'userLikeCount', '-')}
                    </Descriptions.Item>
                </Descriptions>
            </div>
        );
    }, [ statisticsSummary ]);

    const tableNode = useMemo(() => {
        return (
            <div className="statistics-table-box">
                <h3 style={{ marginLeft: 10 }} className="subtitle">
                    按天统计总数
                </h3>
                <Q1Table
                    key="statisticsTable"
                    tableName="operation@page__list__club_statistics"
                    loading={loading}
                    rowKey="key"
                    columns={columns}
                    dataSource={data}
                    download={hasFunctionPermit('btn__down__statistics_user') && download}
                    pagination={{
                        showSizeChanger: true,
                        ...pagination,
                        showTotal: () => `共${pagination.total}条`,
                    }}
                    onChange={handleChange}
                />
            </div>
        );
    }, [ columns, data, download, handleChange, hasFunctionPermit, loading, pagination ]);

    return (
        <div className="club-statistics">
            {filterNode}
            {renderStatisticsNode}
            {tableNode}
        </div>
    );
}

function StatisticsPage() {
    const { Club } = useStore();
    const isLoaded = useObserver(() => Club.isLoaded);
    return !isLoaded ? (
        <Spin size="large">
            <div style={{ height: '100vh' }}></div>
        </Spin>
    ) : (
        <Statistics />
    );
}

export default ContentMemo(StatisticsPage);
