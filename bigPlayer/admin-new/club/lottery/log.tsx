import { inject, observer } from 'mobx-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DatePicker, Form, Input, Select } from 'antd';
import { ColumnsType, FilterBox, Q1Table, Q1TablePropsType } from 'q1-antd';
import moment from 'moment';
import { keyBy } from 'lodash';

import { StoreType } from '@/store/config';
import { getLotteryLogList } from '@/api/club';
import { usePersistantFunction } from '@/hooks/state/useLatestValueRef';
import { simpleTime } from '@/utils/date';
import { useTableAdaptHeight } from '@/utils/tableAdapt';
import { useContentTabSearch, useReactive } from '@/context';

import { paginationType } from '@ts/common';
import { FeedbackResponseType2 } from '@ts/api';
import {
    CLUB_DEPLOY_VERSION,
    LOGGETSTATUS,
    LogGetStatusColor,
    LogGetStatusConstant,
    LogListReward,
    LotteryLogListResponse,
    PrizeConstant,
    PRIZEENUM,
} from '@ts/club';
import { OMIT_TABLE_HEIGHT } from '@ts/clientModel';

const { RangePicker } = DatePicker;
const defaultPagination: paginationType = {
    pageIndex: 1,
    pageSize: 10,
};
interface LotteryLogProps {}
interface MobxLotteryLogProps
    extends LotteryLogProps,
        Pick<StoreType, 'UIState' | 'Permit' | 'Game' | 'GameContext' | 'User'> {}
const options = [
    { label: '用户ID', value: 'userId' },
    { label: '昵称', value: 'nickName' },
    { label: '通行证ID', value: 'passportId' },
    { label: '通行证账号', value: 'userName' },
];
const LotteryLog = function (props: LotteryLogProps) {
    const {
        Game: { worldList, isLoaded },
    } = props as MobxLotteryLogProps;
    const query = useContentTabSearch();
    const clubDeployVersion = query.get('clubDeployVersion')! as CLUB_DEPLOY_VERSION;
    const id = query.get('id') || '';
    const boardId = query.get('boardId') || 0;
    const [ logForm ] = Form.useForm();
    const tableEl = useRef<HTMLDivElement>(null);
    const getTableHeight = useTableAdaptHeight(tableEl, OMIT_TABLE_HEIGHT);
    const filterers = FilterBox.useFilterBox();
    const [ currentPagination, setCurrentPagination ] = useState(defaultPagination); // 分页
    const [ loading, setLoading ] = useState(false);
    const [ tableData, setTableData ] = useState<FeedbackResponseType2<LotteryLogListResponse[]>>(
        {} as FeedbackResponseType2<LotteryLogListResponse[]>
    );
    const [ initialValues ] = useState({
        type: 'userId',
        typeContent: '',
    });

    const worldListDict = useMemo(() => {
        return keyBy(worldList, item => item.id);
    }, [ worldList ]);

    // 获取table数据
    const { fetchTableData } = usePersistantFunction({
        fetchTableData: async () => {
            try {
                setLoading(true);
                const { type, typeContent, notarizeTime, ...values } = await filterers.validate();
                let params: any = {
                    id,
                    ...values,
                    ...(typeContent ? { [type]: typeContent } : {}),
                    ...(notarizeTime?.length
                        ? {
                              startTime: moment(notarizeTime[0]).startOf('day').utc().format(),
                              endTime: moment(notarizeTime[1]).endOf('day').utc().format(),
                          }
                        : {}),
                    ...currentPagination,
                };
                let { data: result, total } = await getLotteryLogList(params, Number(boardId), clubDeployVersion);
                setTableData({
                    data: result?.map((x, i) => {
                        const reward = JSON.parse(x.reward || '[]');
                        const rewardEnum = reward.some((x: { RewardEnum: PRIZEENUM }) =>
                            [ PRIZEENUM.Entity ].includes(x.RewardEnum)
                        )
                            ? PRIZEENUM.Entity
                            : PRIZEENUM.Prop;
                        return {
                            ...x,
                            rewardEnum: rewardEnum,
                            index: (currentPagination.pageIndex - 1) * currentPagination.pageSize + (i + 1),
                        };
                    }),
                    total,
                });
            } catch (e) {
                console.log(e);
            } finally {
                setLoading(false);
            }
        },
    });
    // 请求table数据
    useEffect(() => {
        fetchTableData();
    }, [ currentPagination.pageIndex, currentPagination.pageSize, fetchTableData ]);

    useReactive(() => {
        fetchTableData();
    });
    // 分页
    function handleChange(nextPagination: any, filters: any, sorter: any) {
        setCurrentPagination({
            pageIndex: nextPagination.current,
            pageSize: nextPagination.pageSize || defaultPagination.pageSize,
        });
    }
    // 查询
    function fetchTableDataByFilter() {
        setCurrentPagination(prev => {
            if (prev.pageIndex === currentPagination.pageIndex && prev.pageSize === currentPagination.pageSize) {
                fetchTableData();
            }
            return {
                pageIndex: 1,
                pageSize: prev.pageSize,
            };
        });
    }

    // 表格数据
    const tableProps: Q1TablePropsType<LotteryLogListResponse> = useMemo(() => {
        const columns: ColumnsType<LotteryLogListResponse> = [
            {
                title: '序号',
                dataIndex: 'index',
                width: 80,
            },
            {
                title: '用户ID',
                dataIndex: 'userId',
                width: 80,
            },
            {
                title: '昵称',
                dataIndex: 'nickName',
                width: 100,
            },
            {
                title: '通行证ID',
                dataIndex: 'passportId',
                width: 120,
            },
            {
                title: '通行证账号',
                dataIndex: 'userName',
                width: 120,
            },
            {
                title: '角色ID',
                dataIndex: 'roleId',
                width: 100,
            },
            {
                title: '角色名称',
                dataIndex: 'roleName',
                width: 120,
            },
            {
                title: '游戏世界',
                dataIndex: 'worldId',
                width: 100,
                render: x => (x ? worldListDict[x]?.name : null),
            },
            {
                title: '领取状态',
                dataIndex: 'status',
                width: 100,
                render: (v: LOGGETSTATUS) => (
                    <span style={{ color: LogGetStatusColor[v] }}>{LogGetStatusConstant[v]}</span>
                ),
            },
            {
                title: '奖品',
                dataIndex: 'reward',
                width: 200,
                render: (v: string, record) => {
                    return JSON.parse(record?.reward || '[]')?.map((x: LogListReward, i: number) => (
                        <div key={i}>{`${x.Name}*${x.Number}`}</div>
                    ));
                },
            },
            {
                title: '奖品类型',
                dataIndex: 'rewardEnum',
                width: 120,
                render: (v: PRIZEENUM, record) => {
                    return (
                        <span>
                            {record.reward?.length
                                ? [ PRIZEENUM.EmpiricalValue, PRIZEENUM.MemberPoint ].includes(v)
                                    ? '货币'
                                    : PrizeConstant[v]
                                : ''}
                        </span>
                    );
                },
            },
            {
                title: '收货信息',
                dataIndex: 'address',
                width: 300,
                render: (v: string, record) => {
                    let row = record as LotteryLogListResponse & { rewardEnum: PRIZEENUM };
                    return row.rewardEnum === PRIZEENUM.Entity ? (
                        <div style={{ wordBreak: 'break-all' }}>
                            <span>收件人：{record.name}</span>
                            <br />
                            <span>联系电话：{record.phone}</span>
                            <br />
                            <span>
                                所在城市：{record.province}
                                {record.city}
                            </span>
                            <br />
                            <span>详细地址：{record.address}</span>
                            <br />
                        </div>
                    ) : (
                        '-'
                    );
                },
            },
            {
                title: '确认时间',
                dataIndex: 'confirmTime',
                width: 160,
                render: (v: string) => simpleTime(v),
            },
        ];
        return {
            columns: columns,
            dataSource: tableData.data,
            rowKey: 'id',
            tableName: `operation@page__list__club_lottery@${'log'}`,
            loading: loading && isLoaded,
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
        };
    }, [
        currentPagination.pageIndex,
        currentPagination.pageSize,
        isLoaded,
        loading,
        tableData.data,
        tableData.total,
        worldListDict,
    ]);

    return (
        <div className="lottery-create-page">
            <FilterBox
                form={logForm}
                context={filterers}
                query={fetchTableDataByFilter}
                tableName="clubCommentTable"
                showAdvancedFilter={false}
                initialValues={initialValues}
                key={JSON.stringify(initialValues)}
            >
                <FilterBox.Item name="notarizeTime" label="确认日期">
                    <RangePicker format="YYYY-MM-DD" />
                </FilterBox.Item>
                <FilterBox.Item type="compactNormal">
                    <Input.Group compact>
                        <FilterBox.Item name="type" noStyle>
                            <Select options={options} />
                        </FilterBox.Item>
                        <FilterBox.Item
                            noStyle
                            shouldUpdate={(prev, next) => {
                                return prev.type !== next.type;
                            }}
                        >
                            <FilterBox.Item name="typeContent" noStyle>
                                <Input placeholder="请输入" style={{ width: 250 }} allowClear />
                            </FilterBox.Item>
                        </FilterBox.Item>
                    </Input.Group>
                </FilterBox.Item>
            </FilterBox>
            <div ref={tableEl}>
                <Q1Table {...tableProps} scroll={{ y: getTableHeight }} />
            </div>
        </div>
    );
};

export default inject('UIState', 'Permit', 'Game', 'GameContext', 'User', 'Club')(observer(LotteryLog));
