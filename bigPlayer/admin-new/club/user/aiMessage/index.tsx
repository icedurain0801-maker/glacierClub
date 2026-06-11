import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input, InputNumber, Popover, Select, Spin, Table } from 'antd';
import { inject, observer } from 'mobx-react';
import { ColumnsType, FilterBox, Q1Table } from 'q1-antd';
import { get } from 'lodash';

import RangePicker from '@/components/RangePicker';
import { quickPickTimeRange, setUtcEndTimeAndFormat, setUtcStartTimeAndFormat, simpleTime } from '@/utils/date';
import BlockHeader from '@/components/BlockHeader';
import {
    downloadConversationRecordListHerf,
    getConversationMessageList,
    getConversationRecordList,
    getConversationStatistics,
} from '@/api/club';
import { useContentPermissionFn } from '@/context';
import { isEmpty } from '@/utils/helper';

import {
    BOARD_PERMIT_SEPARATE,
    BoardPermitOptionsType,
    CLUB_FILTER,
    ClubFilterDataConstant,
    ClubFilterOptions,
    ConversationMessageItem,
    ConversationRecordItem,
    ConversationStatisticsItem,
} from '@ts/club';
import { DefaultPagination } from '@ts/enum/table';
import { DOWNLOAD_PAGESIZE } from '@ts/api';

import { usePremitClubBoard } from '../../board/hooks/useClubBoardOptions';
import UserMessage from './userMessage';

interface AiMeesageProps {
    clubBoardOptions: BoardPermitOptionsType[];
}

interface AiMessagePropsMobx extends AiMeesageProps, Pick<Storage, 'Club'> {}

const transformFilterItemCom = function transformFilterItemCom(type: CLUB_FILTER) {
    return (
        <FilterBox.Item name={ClubFilterDataConstant[type]} noStyle>
            {[ CLUB_FILTER.PassportId ].includes(type) ? (
                <InputNumber placeholder="请输入" style={{ width: 190 }} />
            ) : (
                <Input placeholder="请输入" style={{ width: 250 }} allowClear />
            )}
        </FilterBox.Item>
    );
};

function AiMessage(props: AiMeesageProps) {
    const { clubBoardOptions } = props as AiMessagePropsMobx;

    const filterbox = FilterBox.useFilterBox();
    const { hasFunctionPermit } = useContentPermissionFn();

    const [ loading, setLoading ] = useState(false);
    const [ _boardId, setBoardId ] = useState(
        get(clubBoardOptions, '0.children.0.value').split(BOARD_PERMIT_SEPARATE)[1]
    );
    const [ clubDeployVersion, setclubDeployVersion ] = useState(get(clubBoardOptions, '0.value'));

    let initVal = useMemo(() => {
        return { field: CLUB_FILTER.PassportId, boardId: get(clubBoardOptions, '0.children.0.value') };
    }, [ clubBoardOptions ]);

    const currentPagination = useRef(DefaultPagination);

    const [ conversationStatistics, setConversationStatistics ] = useState<Partial<ConversationStatisticsItem>>({});
    const [ tableData, setTableData ] = useState<{
        data: Array<ConversationRecordItem>;
        total: number;
    }>({
        data: [],
        total: 0,
    });

    const totalDataSource = useMemo(() => {
        return [ conversationStatistics ] as ConversationStatisticsItem[];
    }, [ conversationStatistics ]);

    const fetchData = useCallback(
        async (onlyTable?: true) => {
            setLoading(true);
            try {
                const { boardId, actionTime, field, ...rest } = await filterbox.validate();
                const _boardId = boardId.split(BOARD_PERMIT_SEPARATE)[1];
                const params = {
                    boardId: _boardId,
                    ...(actionTime && actionTime.length > 0
                        ? {
                              start: actionTime[0] ? setUtcStartTimeAndFormat(actionTime[0]) : '',
                              end: actionTime[1] ? setUtcEndTimeAndFormat(actionTime[1]) : '',
                          }
                        : {}),
                };
                const conversationMessageParams = {
                    ...params,
                    ...rest,
                    ...currentPagination.current,
                };
                if (onlyTable) {
                    const recordListRes = await getConversationRecordList(conversationMessageParams, clubDeployVersion);
                    const { code, data = [], total = 0 } = recordListRes;
                    if (code === 0 && data) {
                        setTableData({ data, total });
                    } else {
                        setTableData({ data: [], total: 0 });
                    }
                    return;
                } else {
                    const [ statisticsRes, recordListRes ] = await Promise.all([
                        getConversationStatistics(params, clubDeployVersion),
                        getConversationRecordList(conversationMessageParams, clubDeployVersion),
                    ]);

                    const { code: statisticsCode, data: statisticsData = {} } = statisticsRes;
                    const { code, data = [], total = 0 } = recordListRes;
                    if (statisticsCode === 0 && statisticsData) {
                        setConversationStatistics(statisticsData);
                    } else {
                        setConversationStatistics({});
                    }
                    if (code === 0 && data) {
                        setTableData({ data, total });
                    } else {
                        setTableData({ data: [], total: 0 });
                    }
                }
            } finally {
                setLoading(false);
            }
        },
        [ clubDeployVersion, filterbox ]
    );

    useEffect(() => {
        fetchData();
    }, [ fetchData ]);

    const handleChangeBoardId = useCallback(
        async val => {
            const [ clubDeploy ] = val.split(BOARD_PERMIT_SEPARATE);
            setBoardId(val.split(BOARD_PERMIT_SEPARATE)[1]);
            setclubDeployVersion(clubDeploy);
            fetchData();
        },
        [ fetchData ]
    );

    const totalColumns: ColumnsType<ConversationStatisticsItem> = useMemo(() => {
        return [
            {
                dataIndex: 'totalConversationsCount',
                title: '会话次数',
                switch: 1,
                align: 'left',
                render: v => v ?? '-',
            },
            {
                dataIndex: 'totalUsers',
                title: '会话人数',
                switch: 1,
                align: 'left',
                render: v => v ?? '-',
            },
            {
                dataIndex: 'dialogueTurnsPercent',
                title: '平均对话轮数',
                switch: 1,
                align: 'left',
                render: v => v ?? '-',
            },
            {
                dataIndex: 'totalStandardResponses',
                title: '标准回答数',
                switch: 1,
                align: 'left',
                render: v => v ?? '-',
            },
            {
                dataIndex: 'standardSatisfactionPercent',
                title: '平均标准回答满意度',
                switch: 1,
                align: 'left',
                render: v => (!isEmpty(v) ? v + '%' : '-'),
            },
            {
                dataIndex: 'totalFreeResponses',
                title: '自由回答数',
                switch: 1,
                align: 'left',
                render: v => v ?? '-',
            },
            {
                dataIndex: 'freeSatisfactionPercent',
                title: '平均自由回答满意度',
                switch: 1,
                align: 'left',
                render: v => (!isEmpty(v) ? v + '%' : '-'),
            },
        ];
    }, []);

    // 查看详情
    const [ msgList, setMsgList ] = useState<Array<ConversationMessageItem>>([]);
    const [ msgLoading, setMsgLoading ] = useState(false);

    const getMessageList = useCallback(
        async (msgId: string) => {
            setMsgLoading(true);
            try {
                const { code, data } = await getConversationMessageList(
                    {
                        boardId: _boardId,
                        id: msgId,
                        pageIndex: 1,
                        pageSize: DOWNLOAD_PAGESIZE,
                    },
                    clubDeployVersion
                );
                if (code === 0 && data?.length) {
                    setMsgList(data);
                } else {
                    setMsgList([]);
                }
            } finally {
                setMsgLoading(false);
            }
        },
        [ _boardId, clubDeployVersion ]
    );

    const columns: ColumnsType<ConversationRecordItem> = useMemo(() => {
        return [
            {
                dataIndex: 'conversationId',
                title: '会话Id',
                switch: 1,
                align: 'center',
                width: 160,
                ellipsis: true,
            },
            {
                dataIndex: 'nickName',
                title: '昵称',
                switch: 1,
                align: 'center',
                width: 160,
                ellipsis: true,
            },
            {
                dataIndex: 'userId',
                title: '大玩家ID',
                switch: 1,
                align: 'center',
                width: 120,
            },
            {
                dataIndex: 'passportId',
                title: '冰川通行证ID',
                switch: 1,
                align: 'center',
                width: 120,
            },
            {
                dataIndex: 'detail',
                title: '会话记录',
                switch: 1,
                align: 'center',
                render: (_, record) => {
                    return (
                        <Popover
                            trigger="click"
                            placement="top"
                            onVisibleChange={visible => {
                                if (!visible) {
                                    setTimeout(() => {
                                        setMsgList([]);
                                    }, 100);
                                } else {
                                    getMessageList(record.conversationId);
                                }
                            }}
                            content={
                                <Spin spinning={msgLoading}>
                                    <div style={{ maxHeight: 580, overflowY: 'auto' }}>
                                        {msgList.length > 0
                                            ? msgList.map((item, index) => {
                                                  return (
                                                      <div key={index}>
                                                          <div className="color-blue">
                                                              {item.userName}&nbsp;{simpleTime(item.createTime)}
                                                          </div>
                                                          <UserMessage message={item} />
                                                      </div>
                                                  );
                                              })
                                            : '暂无数据'}
                                    </div>
                                </Spin>
                            }
                        >
                            <span className="q1-link">查看详情</span>
                        </Popover>
                    );
                },
            },
            {
                dataIndex: 'dialogueTurns',
                title: '单次对话轮数',
                switch: 1,
                align: 'center',
                width: 120,
            },
            {
                dataIndex: 'standardResponses',
                title: '标准回答数',
                switch: 1,
                align: 'center',
                width: 120,
            },
            {
                dataIndex: 'standardSatisfactionPercent',
                title: '标准回答满意度',
                switch: 1,
                align: 'center',
                width: 120,
                render: v => (!isEmpty(v) ? v + '%' : '-'),
            },
            {
                dataIndex: 'freeResponses',
                title: '自由回答数',
                switch: 1,
                align: 'center',
                width: 120,
            },
            {
                dataIndex: 'freeSatisfactionPercent',
                title: '自由回答满意度',
                switch: 1,
                align: 'center',
                width: 120,
                render: v => (!isEmpty(v) ? v + '%' : '-'),
            },
        ];
    }, [ getMessageList, msgList, msgLoading ]);

    const handleChange = (current: number, size?: number) => {
        currentPagination.current = {
            pageIndex: current,
            pageSize: size || DefaultPagination.pageSize,
        };
        fetchData(true);
    };

    const download = useCallback(async () => {
        const { boardId, actionTime, field, ...rest } = await filterbox.validate();
        const params = {
            boardId: _boardId,
            ...(actionTime && actionTime.length > 0
                ? {
                      start: actionTime[0] ? setUtcStartTimeAndFormat(actionTime[0]) : '',
                      end: actionTime[1] ? setUtcEndTimeAndFormat(actionTime[1]) : '',
                  }
                : {}),
            ...rest,
            pageIndex: 1,
            pageSize: DOWNLOAD_PAGESIZE,
        };
        await downloadConversationRecordListHerf(params, clubDeployVersion);
    }, [ _boardId, clubDeployVersion, filterbox ]);

    return (
        <Spin spinning={loading}>
            <div className="q1-content__main q1-content__main_white">
                <FilterBox query={fetchData} tableName="club_ai_message" context={filterbox} initialValues={initVal}>
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
                    <FilterBox.Item
                        className="filterbox-compact-model filterbox-compact-model-flex"
                        type="compactNormal"
                    >
                        <Input.Group compact>
                            <FilterBox.Item name="field" noStyle>
                                <Select options={ClubFilterOptions} />
                            </FilterBox.Item>
                            <FilterBox.Item noStyle shouldUpdate={(prev, next) => prev.field !== next.field}>
                                {({ getFieldValue }) => transformFilterItemCom(getFieldValue('field'))}
                            </FilterBox.Item>
                        </Input.Group>
                    </FilterBox.Item>

                    <FilterBox.Item name="actionTime" label="日期选择">
                        <RangePicker allowClear ranges={quickPickTimeRange} />
                    </FilterBox.Item>
                </FilterBox>
                <BlockHeader title="总计" hasBottom size="middle" />
                <Table
                    columns={totalColumns}
                    dataSource={totalDataSource}
                    rowKey={() => 'summary'}
                    bordered
                    pagination={false}
                    className="mb-20"
                />
                <BlockHeader title="单次会话记录" hasBottom size="middle" />
                <Q1Table
                    key="club-aiMessage-table"
                    tableName="operation@page__list__club_aiMessage"
                    loading={loading}
                    rowKey="id"
                    columns={columns}
                    dataSource={tableData.data}
                    download={hasFunctionPermit('btn__down__club_aiMessage') && download}
                    pagination={{
                        showSizeChanger: true,
                        ...currentPagination.current,
                        showTotal: () => `共${tableData.total}条`,
                        onChange: handleChange,
                        onShowSizeChange: handleChange,
                    }}
                />
            </div>
        </Spin>
    );
}

const AiMessageBase = inject('Club')(observer(AiMessage));

export default function AiMessageAll(props: any) {
    const { clubBoardOptions } = usePremitClubBoard();
    return !clubBoardOptions.length ? (
        <Spin size="large">
            <div style={{ height: '100vh' }}></div>
        </Spin>
    ) : (
        <AiMessageBase {...props} clubBoardOptions={clubBoardOptions} />
    );
}
