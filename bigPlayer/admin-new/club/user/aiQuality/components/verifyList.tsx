import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, message, Tabs } from 'antd';
import { ColumnsType, Q1Table } from 'q1-antd';

import { batchReviewQuality, getQualityList, reviewQuality } from '@/api/clubQuality';
import ActionGroup from '@/components/ActionGroup';
import BlockHeader from '@/components/BlockHeader';
import CommonTable, { useCommonTableRef } from '@/components/commonTable';
import TableCellText from '@/components/display/Table/TableCellText';
import TagList from '@/components/TagList';
import { simpleTime } from '@/utils/date';
import { omitKeys } from '@/utils/lib';

import { TableColumnWidth } from '@ts/app';
import {
    ClubAiChatAuditFormValues,
    ClubAiChatVerifyCategoryLabelMap,
    ClubAiContentAuditFormValues,
    ClubAiContentBatchAuditFormValues,
    ClubAiVerifyResultLabelMap,
    QUALITY_QUERY_TYPE,
    QUALITY_TYPE,
    QualityQueryTypeMap,
    QualityListItem,
    QualityParams,
} from '@ts/clubQuality';
import { BOARD_PERMIT_SEPARATE, CLUB_DEPLOY_VERSION } from '@ts/club';
import { tryToParseJson } from '@ts/lib';

import { useAiQualityContext } from '../context';
import ChatAuditDetailModal from './ChatAuditDetailModal';
import ContentAuditBatchModal from './ContentAuditBatchModal';
import ContentAuditDetailModal from './ContentAuditDetailModal';

import './verifyList.less';

type VerifyListTabKey = 'audit' | 'verify';
type VerifyListScene = 'content-audit' | 'content-verify' | 'chat-audit' | 'chat-verify';

export interface VerifyListRow extends Partial<QualityListItem> {
    checkId: QualityListItem['checkId'];
    userId: QualityListItem['userId'];
    nickName: QualityListItem['nickName'];
    result?: string;
    resultType?: 'success' | 'error' | 'info';
    category?: string;
    manualReply?: string;
    actionText?: string;
}

const TAB_OPTIONS: Array<{ label: string; key: VerifyListTabKey }> = [
    { label: '审核列表', key: 'audit' },
    { label: '校验列表', key: 'verify' },
];

const QUALITY_STATUS_BY_SCENE: Record<VerifyListScene, number> = {
    'content-audit': 1,
    'content-verify': 2,
    'chat-audit': 1,
    'chat-verify': 2,
};

const QUALITY_STATUS_TEXT_MAP: Record<number, string> = {
    1: '待处理',
    2: '已处理',
};

function ResultText(props: { text?: string; type?: VerifyListRow['resultType'] }) {
    return (
        <span
            className={`club-ai-quality-verify__result${
                props.type ? ` club-ai-quality-verify__result_${props.type}` : ''
            }`}
            title={props.text ?? ''}
        >
            {props.text || '--'}
        </span>
    );
}

function getScene(tableType: QUALITY_TYPE, activeTab: VerifyListTabKey): VerifyListScene {
    if (tableType === QUALITY_TYPE.Message) {
        return activeTab === 'audit' ? 'chat-audit' : 'chat-verify';
    }

    return activeTab === 'audit' ? 'content-audit' : 'content-verify';
}

function getBadcasePost(row: VerifyListRow) {
    return row.posts?.find(item => item.id === row.mismatchedPostId) || row.posts?.[0];
}

function parseBoardValue(boardValue?: string) {
    if (!boardValue) {
        return { clubDeployVersion: undefined, boardId: undefined };
    }

    const [ clubDeployVersion, boardId ] = boardValue.split(BOARD_PERMIT_SEPARATE);

    return {
        clubDeployVersion: clubDeployVersion as CLUB_DEPLOY_VERSION | undefined,
        boardId,
    };
}

function mapContentResultType(result?: number): VerifyListRow['resultType'] {
    if (result === 1) {
        return 'success';
    }
    if (result === 2) {
        return 'error';
    }
    return 'info';
}

function mapCheckTypeDisplay(value?: QualityListItem['checkType']) {
    if (value == null) {
        return undefined;
    }
    if (typeof value === 'string' && value in ClubAiChatVerifyCategoryLabelMap) {
        return ClubAiChatVerifyCategoryLabelMap[value as keyof typeof ClubAiChatVerifyCategoryLabelMap];
    }
    return String(value);
}

function mapQualityItemToRow(item: QualityListItem, scene: VerifyListScene): VerifyListRow {
    return {
        ...item,
        status: QUALITY_STATUS_TEXT_MAP[item.status] || String(item.status ?? '--'),
        result:
            scene === 'content-verify' ? ClubAiVerifyResultLabelMap[item.checkResult as 1 | 2 | 3] || '--' : undefined,
        resultType: scene === 'content-verify' ? mapContentResultType(item.checkResult) : undefined,
        category: scene === 'chat-verify' ? mapCheckTypeDisplay(item.checkType) : undefined,
        manualReply: scene === 'chat-verify' ? undefined : undefined,
        actionText:
            scene === 'content-audit' || scene === 'chat-audit' ? '校验' : scene === 'chat-verify' ? '查看' : undefined,
    };
}

function buildCheckIds(keys: React.Key[]) {
    return keys.map(key => Number(key)).filter(key => !Number.isNaN(key));
}

function VerifyList() {
    const { tableType, queryValues, queryVersion } = useAiQualityContext();
    const commonTableRef = useCommonTableRef<VerifyListRow>();
    const [ activeTab, setActiveTab ] = useState<VerifyListTabKey>('audit');
    const [ selectedRowKeys, setSelectedRowKeys ] = useState<React.Key[]>([]);
    const [ batchVisible, setBatchVisible ] = useState(false);
    const [ chatDetailVisible, setChatDetailVisible ] = useState(false);
    const [ chatDetailRecord, setChatDetailRecord ] = useState<VerifyListRow | null>(null);
    const [ detailVisible, setDetailVisible ] = useState(false);
    const [ detailCheckId, setDetailCheckId ] = useState<number | null>(null);
    const tableCellPopoverProps = useMemo(
        () => ({
            placement: 'topLeft' as const,
            getPopupContainer: () => document.body,
        }),
        []
    );

    useEffect(() => {
        setActiveTab('audit');
        setSelectedRowKeys([]);
        setBatchVisible(false);
        setChatDetailVisible(false);
        setChatDetailRecord(null);
        setDetailVisible(false);
        setDetailCheckId(null);
    }, [ tableType ]);

    const scene = useMemo(() => getScene(tableType, activeTab), [ activeTab, tableType ]);
    const { clubDeployVersion, boardId } = useMemo(() => parseBoardValue(queryValues.boardId), [ queryValues.boardId ]);

    useEffect(() => {
        commonTableRef.current?.refresh();
    }, [ commonTableRef, queryVersion, scene ]);

    const rowSelection = useMemo(() => {
        if (scene !== 'content-audit') {
            return undefined;
        }

        return {
            selectedRowKeys,
            columnWidth: TableColumnWidth.small,
            onChange: (keys: React.Key[]) => {
                setSelectedRowKeys(keys);
            },
        };
    }, [ scene, selectedRowKeys ]);

    const handleOpenContentAuditDetail = useCallback((record: VerifyListRow) => {
        setDetailCheckId(Number(record.checkId));
        setDetailVisible(true);
    }, []);

    const handleOpenContentAuditBatch = useCallback(() => {
        setBatchVisible(true);
    }, []);

    const handleCloseContentAuditBatch = useCallback(() => {
        setBatchVisible(false);
    }, []);

    const handleSubmitContentAuditBatch = useCallback(
        async (values: ClubAiContentBatchAuditFormValues) => {
            const checkIds = buildCheckIds(selectedRowKeys);

            if (!clubDeployVersion || !boardId || !checkIds.length) {
                message.error('提交失败，请先选择有效数据');
                return;
            }

            const { code, msg } = await batchReviewQuality(
                { boardId },
                {
                    checkIds,
                    resultStatus: values.resultStatus,
                    checkType: values.checkType,
                },
                clubDeployVersion
            );
            if (code === 0) {
                setSelectedRowKeys([]);
                commonTableRef.current?.refresh();
                setBatchVisible(false);
                message.success('校验成功');
            } else {
                message.error(msg);
            }
        },
        [ boardId, clubDeployVersion, commonTableRef, selectedRowKeys ]
    );

    const handleOpenChatAuditDetail = useCallback((record: VerifyListRow) => {
        setChatDetailRecord(record);
        setChatDetailVisible(true);
    }, []);

    const handleCloseChatAuditDetail = useCallback(() => {
        setChatDetailVisible(false);
        setChatDetailRecord(null);
    }, []);

    const handleSubmitChatAuditDetail = useCallback(
        async (values: ClubAiChatAuditFormValues) => {
            const checkId = Number(chatDetailRecord?.checkId);

            if (!clubDeployVersion || !boardId || Number.isNaN(checkId) || !values.verifyResult) {
                message.error('提交失败，请刷新后重试');
                return;
            }

            const { code, msg } = await reviewQuality(
                { boardId },
                {
                    checkId,
                    resultStatus: values.verifyResult,
                    checkType: values.checkType,
                    manualCorrection: values.manualCorrection || '',
                },
                clubDeployVersion
            );
            if (code === 0) {
                setChatDetailVisible(false);
                setChatDetailRecord(null);
                commonTableRef.current?.refresh();
                message.success('校验成功');
            } else {
                message.error(msg);
            }
        },
        [ boardId, chatDetailRecord?.checkId, clubDeployVersion, commonTableRef ]
    );

    const handleCloseContentAuditDetail = useCallback(() => {
        setDetailVisible(false);
        setDetailCheckId(null);
    }, []);

    const handleSubmitContentAuditDetail = useCallback(
        async (values: ClubAiContentAuditFormValues) => {
            const checkId = Number(detailCheckId);

            if (!clubDeployVersion || !boardId || Number.isNaN(checkId)) {
                message.error('提交失败，请刷新后重试');
                return;
            }

            const { code, msg } = await reviewQuality(
                { boardId },
                {
                    checkId,
                    resultStatus: values.verifyResult,
                    checkType: [ values.verifyReason ],
                },
                clubDeployVersion
            );
            if (code === 0) {
                setDetailVisible(false);
                setDetailCheckId(null);
                commonTableRef.current?.refresh();
                message.success('校验成功');
            } else {
                message.error(msg);
            }
        },
        [ boardId, clubDeployVersion, commonTableRef, detailCheckId ]
    );

    const contentAuditTableColumns = useMemo<ColumnsType<VerifyListRow>>(
        () => [
            { title: '核验ID', dataIndex: 'checkId', key: 'checkId', width: TableColumnWidth.normal, switch: 1 },
            { title: '玩家ID', dataIndex: 'userId', key: 'userId', width: TableColumnWidth.normal, switch: 1 },
            {
                title: '玩家昵称',
                dataIndex: 'nickName',
                key: 'nickName',
                width: TableColumnWidth.normal,
                ellipsis: true,
                switch: 1,
            },
            {
                title: '玩家当次匹配的标签',
                dataIndex: 'matchTags',
                key: 'matchTags',
                width: TableColumnWidth.large,
                switch: 1,
                render: (_, row) => (
                    <TagList data={row.matchTags || []} mykey="content-audit-tags" renderItem showNum={3} />
                ),
            },
            {
                title: '状态',
                dataIndex: 'status',
                key: 'status',
                width: TableColumnWidth.normal,
                ellipsis: true,
                switch: 1,
            },
            {
                title: 'Badcase帖文',
                dataIndex: 'posts',
                key: 'posts',
                width: TableColumnWidth.large,
                switch: 1,
                render: (_, row) => <TableCellText data={getBadcasePost(row)?.title} />,
            },
            {
                title: '帖文当次排名',
                dataIndex: 'postRank',
                key: 'postRank',
                width: TableColumnWidth.normal,
                switch: 1,
                render: value => <span className="club-ai-quality-verify__score-text">{value}</span>,
            },
            {
                title: '监督大模型判断原因',
                dataIndex: 'aiReason',
                key: 'aiReason',
                width: TableColumnWidth.large,
                ellipsis: true,
                switch: 1,
                render: value => <ResultText text={value} type="error" />,
            },
            {
                title: 'AI评分',
                dataIndex: 'aiScore',
                key: 'aiScore',
                width: TableColumnWidth.normal,
                switch: 1,
                render: value => <span className="club-ai-quality-verify__score-text">{value}</span>,
            },
            {
                title: '时间',
                dataIndex: 'createdAt',
                key: 'createdAt',
                width: TableColumnWidth.time,
                switch: 1,
                render: (v: string) => simpleTime(v),
            },
            {
                title: '操作',
                dataIndex: 'actions',
                key: 'actions',
                width: TableColumnWidth.operationWithOneSmallBtn,
                switch: 1,
                disabledSwitch: true,
                fixed: 'right',
                render: (_, record) => (
                    <ActionGroup
                        btns={[
                            {
                                title: '',
                                icon: '',
                                action: async () => {
                                    handleOpenContentAuditDetail(record);
                                    return true;
                                },
                                props: {
                                    type: 'link',
                                    children: record.actionText || '校验',
                                },
                            },
                        ]}
                    />
                ),
            },
        ],
        [ handleOpenContentAuditDetail ]
    );

    const contentVerifyTableColumns = useMemo<ColumnsType<VerifyListRow>>(
        () => [
            { title: '核验ID', dataIndex: 'checkId', key: 'checkId', width: TableColumnWidth.normal, switch: 1 },
            { title: '玩家ID', dataIndex: 'userId', key: 'userId', width: TableColumnWidth.normal, switch: 1 },
            {
                title: '玩家昵称',
                dataIndex: 'nickName',
                key: 'nickName',
                width: TableColumnWidth.normal,
                ellipsis: true,
                switch: 1,
            },
            {
                title: '玩家当次匹配的标签',
                dataIndex: 'matchTags',
                key: 'matchTags',
                width: TableColumnWidth.large,
                switch: 1,
                render: (_, row) => (
                    <TagList data={row.matchTags || []} mykey="content-verify-tags" renderItem showNum={3} />
                ),
            },
            {
                title: 'Badcase帖文',
                dataIndex: 'posts',
                key: 'posts',
                width: TableColumnWidth.large,
                switch: 1,
                render: (_, row) => <TableCellText data={getBadcasePost(row)?.title} />,
            },
            {
                title: '帖文当次排名',
                dataIndex: 'postRank',
                key: 'postRank',
                width: TableColumnWidth.normal,
                switch: 1,
                render: value => <span className="club-ai-quality-verify__score-text">{value}</span>,
            },
            {
                title: '监督大模型判断原因',
                dataIndex: 'aiReason',
                key: 'aiReason',
                width: TableColumnWidth.large,
                ellipsis: true,
                switch: 1,
                render: value => <ResultText text={value} type="error" />,
            },
            {
                title: 'AI评分',
                dataIndex: 'aiScore',
                key: 'aiScore',
                width: TableColumnWidth.normal,
                switch: 1,
                render: value => <span className="club-ai-quality-verify__score-text">{value}</span>,
            },
            {
                title: '时间',
                dataIndex: 'checkTime',
                key: 'checkTime',
                width: TableColumnWidth.time,
                switch: 1,
                render: (v: string) => simpleTime(v),
            },
            {
                title: '核验结果',
                dataIndex: 'checkResult',
                key: 'checkResult',
                width: TableColumnWidth.large,
                ellipsis: true,
                switch: 1,
                render: (_, row) => <ResultText text={row.result} type={row.resultType} />,
            },
        ],
        []
    );

    const getQuestionMsg = useCallback((userChatSession: string) => {
        const chatMsg = tryToParseJson(userChatSession, { User: '' });
        const { User } = chatMsg;
        return User;
    }, []);

    const chatAuditTableColumns = useMemo<ColumnsType<VerifyListRow>>(
        () => [
            { title: '核验ID', dataIndex: 'checkId', key: 'checkId', width: TableColumnWidth.normal, switch: 1 },
            { title: '玩家ID', dataIndex: 'userId', key: 'userId', width: TableColumnWidth.normal, switch: 1 },
            {
                title: '玩家昵称',
                dataIndex: 'nickName',
                key: 'nickName',
                width: TableColumnWidth.normal,
                ellipsis: true,
                switch: 1,
            },
            {
                title: '状态',
                dataIndex: 'status',
                key: 'status',
                width: TableColumnWidth.normal,
                ellipsis: true,
                switch: 1,
            },
            {
                title: '玩家当次提问',
                dataIndex: 'userChatSession',
                key: 'userChatSession',
                width: TableColumnWidth.large,
                switch: 1,
                render: value => <TableCellText data={getQuestionMsg(value)} popoverProps={tableCellPopoverProps} />,
            },
            {
                title: 'Badcase回答',
                dataIndex: 'aiAnswer',
                key: 'aiAnswer',
                width: TableColumnWidth.huge,
                switch: 1,
                render: value => <TableCellText data={value} popoverProps={tableCellPopoverProps} />,
            },
            {
                title: '监督大模型判断原因',
                dataIndex: 'aiReason',
                key: 'aiReason',
                width: TableColumnWidth.large,
                ellipsis: true,
                switch: 1,
                render: value => <ResultText text={value} type="error" />,
            },
            {
                title: 'AI评分',
                dataIndex: 'aiScore',
                key: 'aiScore',
                width: TableColumnWidth.normal,
                switch: 1,
                render: value => <span className="club-ai-quality-verify__score-text">{value}</span>,
            },
            {
                title: '时间',
                dataIndex: 'createdAt',
                key: 'createdAt',
                width: TableColumnWidth.time,
                switch: 1,
                render: (v: string) => simpleTime(v),
            },
            {
                title: '操作',
                dataIndex: 'actions',
                key: 'actions',
                width: TableColumnWidth.operationWithOneSmallBtn,
                switch: 1,
                disabledSwitch: true,
                fixed: 'right',
                render: (_, record) => (
                    <ActionGroup
                        btns={[
                            {
                                title: '',
                                icon: '',
                                action: async () => {
                                    handleOpenChatAuditDetail(record);
                                    return true;
                                },
                                props: {
                                    type: 'link',
                                    children: record.actionText || '校验',
                                },
                            },
                        ]}
                    />
                ),
            },
        ],
        [ getQuestionMsg, handleOpenChatAuditDetail, tableCellPopoverProps ]
    );

    const chatVerifyTableColumns = useMemo<ColumnsType<VerifyListRow>>(
        () => [
            { title: '核验ID', dataIndex: 'checkId', key: 'checkId', width: TableColumnWidth.normal, switch: 1 },
            { title: '玩家ID', dataIndex: 'userId', key: 'userId', width: TableColumnWidth.normal, switch: 1 },
            {
                title: '玩家昵称',
                dataIndex: 'nickName',
                key: 'nickName',
                width: TableColumnWidth.normal,
                ellipsis: true,
                switch: 1,
            },
            {
                title: '玩家当次提问',
                dataIndex: 'userChatSession',
                key: 'userChatSession',
                width: TableColumnWidth.large,
                switch: 1,
                render: value => <TableCellText data={getQuestionMsg(value)} popoverProps={tableCellPopoverProps} />,
            },
            {
                title: 'Badcase回答',
                dataIndex: 'aiAnswer',
                key: 'aiAnswer',
                width: TableColumnWidth.huge,
                ellipsis: true,
                switch: 1,
                render: value => <ResultText text={value} type="error" />,
            },
            {
                title: '监督大模型判断原因',
                dataIndex: 'aiReason',
                key: 'aiReason',
                width: TableColumnWidth.large,
                ellipsis: true,
                switch: 1,
                render: value => <ResultText text={value} type="error" />,
            },
            {
                title: 'AI评分',
                dataIndex: 'aiScore',
                key: 'aiScore',
                width: TableColumnWidth.normal,
                switch: 1,
                render: value => <span className="club-ai-quality-verify__score-text">{value}</span>,
            },
            {
                title: '判定分类',
                dataIndex: 'checkType',
                key: 'checkType',
                width: TableColumnWidth.normal,
                switch: 1,
                render: (_, row) => row.category || '--',
            },
            {
                title: '人工纠正回答',
                dataIndex: 'manualReply',
                key: 'manualReply',
                width: TableColumnWidth.huge,
                switch: 1,
                render: value => <TableCellText data={value} popoverProps={tableCellPopoverProps} />,
            },
            {
                title: '时间',
                dataIndex: 'checkTime',
                key: 'checkTime',
                width: TableColumnWidth.time,
                switch: 1,
                render: (v: string) => simpleTime(v),
            },
            {
                title: '处理结果',
                dataIndex: 'actions',
                key: 'actions',
                width: TableColumnWidth.operationWithOneSmallBtn,
                switch: 1,
                disabledSwitch: true,
                fixed: 'right',
                render: (_, record) => (
                    <ActionGroup
                        btns={[
                            {
                                title: '',
                                icon: '',
                                props: {
                                    type: 'link',
                                    children: record.actionText || '--',
                                },
                            },
                        ]}
                    />
                ),
            },
        ],
        [ getQuestionMsg, tableCellPopoverProps ]
    );

    const tableColumns = useMemo(() => {
        switch (scene) {
            case 'content-audit':
                return contentAuditTableColumns;
            case 'content-verify':
                return contentVerifyTableColumns;
            case 'chat-audit':
                return chatAuditTableColumns;
            case 'chat-verify':
                return chatVerifyTableColumns;
        }
    }, [ chatAuditTableColumns, chatVerifyTableColumns, contentAuditTableColumns, contentVerifyTableColumns, scene ]);

    const columns = useMemo(() => tableColumns, [ tableColumns ]);

    const title = useCallback(
        () => (
            <ActionGroup
                btns={[
                    ...(scene === 'content-audit'
                        ? [
                              <Button
                                  type="primary"
                                  key="content-audit"
                                  disabled={!selectedRowKeys.length}
                                  onClick={handleOpenContentAuditBatch}
                              >
                                  批量审核
                              </Button>,
                          ]
                        : []),
                ]}
            />
        ),
        [ handleOpenContentAuditBatch, scene, selectedRowKeys.length ]
    );

    const fetchTableData = useCallback(
        async pagination => {
            if (!clubDeployVersion || !boardId) {
                return {
                    pageIndex: pagination.pageIndex,
                    pageSize: pagination.pageSize,
                    total: 0,
                    data: [],
                };
            }

            const queryType = QualityQueryTypeMap[tableType] || QUALITY_QUERY_TYPE.Content;
            const params: QualityParams = {
                boardId,
                type: queryType,
                status: QUALITY_STATUS_BY_SCENE[scene],
                pageIndex: pagination.pageIndex,
                pageSize: pagination.pageSize,
                ...(queryValues.checkLevel ? { checkLevel: queryValues.checkLevel as any } : {}),
                ...(queryValues.startTime != null ? { startTime: queryValues.startTime } : {}),
                ...(queryValues.endTime != null ? { endTime: queryValues.endTime } : {}),
            };

            const { data = [], total = 0 } = await getQualityList(params, clubDeployVersion);
            const tableData = (data || []).map(item => mapQualityItemToRow(item, scene));

            if (!tableData.length && pagination.pageIndex !== 1) {
                commonTableRef.current?.setPagination({
                    pageIndex: 1,
                    pageSize: pagination.pageSize,
                    total: 0,
                });
            }

            return {
                pageIndex: pagination.pageIndex,
                pageSize: pagination.pageSize,
                total,
                data: tableData,
            };
        },
        [
            boardId,
            clubDeployVersion,
            commonTableRef,
            queryValues.checkLevel,
            queryValues.endTime,
            queryValues.startTime,
            scene,
            tableType,
        ]
    );

    const tableNode = useMemo(
        () => (
            <CommonTable<VerifyListRow>
                ref={commonTableRef}
                api={fetchTableData}
                rowKey="checkId"
                columns={columns}
                rowSelection={rowSelection}
                title={title}
                className="q1-table-with-header-sticky"
                refreshDisabled={!boardId}
            >
                {({ data, equaledTableProps }) => (
                    <Q1Table
                        {...omitKeys(equaledTableProps, [ 'size', 'title', 'scroll' ])}
                        tableName={`operation@page__club__aiQuality__${scene}`}
                        tableTools={equaledTableProps.title?.(data)}
                        dataSource={data}
                        defaultSize="small"
                        initialColumns={tableColumns}
                        columns={columns}
                    />
                )}
            </CommonTable>
        ),
        [ boardId, columns, commonTableRef, fetchTableData, rowSelection, scene, tableColumns, title ]
    );

    return (
        <div className="q1-content__main q1-content__main_white club-ai-quality-verify">
            <BlockHeader title="推荐质量待核验池" hasBottom />
            <Tabs
                activeKey={activeTab}
                onChange={key => {
                    setActiveTab(key as VerifyListTabKey);
                    setSelectedRowKeys([]);
                    setBatchVisible(false);
                    setChatDetailVisible(false);
                    setChatDetailRecord(null);
                    setDetailVisible(false);
                    setDetailCheckId(null);
                }}
                animated={false}
                className="club-ai-quality-verify__tabs"
            >
                {TAB_OPTIONS.map(item => (
                    <Tabs.TabPane tab={item.label} key={item.key}></Tabs.TabPane>
                ))}
            </Tabs>
            <div className="club-ai-quality-verify__table">{tableNode}</div>
            <ContentAuditBatchModal
                visible={batchVisible && scene === 'content-audit'}
                count={selectedRowKeys.length}
                onCancel={handleCloseContentAuditBatch}
                onOk={handleSubmitContentAuditBatch}
            />
            <ChatAuditDetailModal
                visible={chatDetailVisible && scene === 'chat-audit'}
                record={chatDetailRecord}
                boardId={boardId}
                clubDeployVersion={clubDeployVersion}
                onCancel={handleCloseChatAuditDetail}
                onOk={handleSubmitChatAuditDetail}
            />
            <ContentAuditDetailModal
                visible={detailVisible && scene === 'content-audit'}
                checkId={detailCheckId}
                boardId={boardId}
                clubDeployVersion={clubDeployVersion}
                onCancel={handleCloseContentAuditDetail}
                onOk={handleSubmitContentAuditDetail}
            />
        </div>
    );
}

export default VerifyList;
