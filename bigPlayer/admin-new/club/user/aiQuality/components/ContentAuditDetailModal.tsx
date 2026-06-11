import React, { useEffect, useMemo, useRef, useState } from 'react';
import { WarningOutlined } from '@ant-design/icons';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button, Empty, message, Modal, Popover, Radio, Space, Spin } from 'antd';

import { getQualityDetail } from '@/api/clubQuality';
import TableCellText from '@/components/display/Table/TableCellText';
import TagList from '@/components/TagList';
import { useContentDialogContainer } from '@/context';
const HugeConfirmModalProps = { width: 900 };

import { CLUB_DEPLOY_VERSION } from '@ts/club';
import {
    CLUB_AI_DIAGNOSIS_RESULT,
    CLUB_AI_VERIFY_REASON,
    CLUB_AI_VERIFY_RESULT,
    ClubAiContentAuditFormValues,
    ClubAiDiagnosisResultLabelMap,
    ClubAiRecommendDiagnosisItem,
    ClubAiVerifyReasonOptions,
    ClubAiVerifyResultOptions,
    QualityDetailItem,
} from '@ts/clubQuality';

import './ContentAuditDetailModal.less';

interface ContentAuditDetailModalProps {
    visible: boolean;
    checkId: number | null;
    boardId?: string;
    clubDeployVersion?: CLUB_DEPLOY_VERSION;
    onCancel?: () => void;
    onOk?: (values: ClubAiContentAuditFormValues) => void | Promise<void>;
}

function ContentAuditDetailModal(props: ContentAuditDetailModalProps) {
    const { visible, checkId, boardId, clubDeployVersion, onCancel, onOk } = props;
    const getContainer = useContentDialogContainer();
    const parentRef = useRef<HTMLDivElement>(null);
    const [ verifyDecision, setVerifyDecision ] = useState<CLUB_AI_VERIFY_RESULT>(CLUB_AI_VERIFY_RESULT.Correct);
    const [ correctReason, setCorrectReason ] = useState<CLUB_AI_VERIFY_REASON>(CLUB_AI_VERIFY_REASON.BadContent);
    const [ detail, setDetail ] = useState<QualityDetailItem | null>(null);
    const [ loading, setLoading ] = useState(false);
    const [ submitLoading, setSubmitLoading ] = useState(false);
    const [ errorMessage, setErrorMessage ] = useState('');

    const recommendItems = useMemo<ClubAiRecommendDiagnosisItem[]>(() => {
        const mismatchedPostId = detail?.mismatchedPostId;

        return (detail?.posts || []).map(item => {
            const highlighted = item.id === mismatchedPostId;

            return {
                id: String(item.id),
                title: item.title,
                result: highlighted ? CLUB_AI_DIAGNOSIS_RESULT.Wrong : CLUB_AI_DIAGNOSIS_RESULT.Match,
                tags: item.tags || [],
                highlighted,
            };
        });
    }, [ detail ]);

    console.log('recommendItems', recommendItems);

    const virtualizer = useVirtualizer({
        count: recommendItems.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 48,
        overscan: 8,
    });

    useEffect(() => {
        if (!visible) {
            setVerifyDecision(CLUB_AI_VERIFY_RESULT.Correct);
            setCorrectReason(CLUB_AI_VERIFY_REASON.BadContent);
            setDetail(null);
            setLoading(false);
            setSubmitLoading(false);
            setErrorMessage('');
            return;
        }

        requestAnimationFrame(() => {
            if (parentRef.current) {
                parentRef.current.scrollTop = 0;
            }
        });
    }, [ visible, checkId ]);

    useEffect(() => {
        let cancelled = false;

        if (!visible || !checkId || !boardId || !clubDeployVersion) {
            return () => {
                cancelled = true;
            };
        }

        setLoading(true);
        setDetail(null);
        setErrorMessage('');

        getQualityDetail({ id: checkId, boardId }, clubDeployVersion)
            .then(({ code, data, msg }) => {
                if (cancelled) {
                    return;
                }

                if (code === 0 && data) {
                    setDetail(data);
                    return;
                }

                const nextMessage = msg || '获取详情失败，请稍后重试';
                setErrorMessage(nextMessage);
                message.error(nextMessage);
            })
            .catch(() => {
                if (cancelled) {
                    return;
                }

                const nextMessage = '获取详情失败，请稍后重试';
                setErrorMessage(nextMessage);
                message.error(nextMessage);
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [ visible, checkId, boardId, clubDeployVersion ]);

    const handleDecisionChange = (value: CLUB_AI_VERIFY_RESULT) => {
        setVerifyDecision(value);
        if (value === CLUB_AI_VERIFY_RESULT.Correct) {
            setCorrectReason(prev => prev || CLUB_AI_VERIFY_REASON.BadContent);
            return;
        }

        setCorrectReason(CLUB_AI_VERIFY_REASON.BadContent);
    };

    const handleSubmit = async () => {
        if (loading || !detail) {
            message.error('详情加载中，请稍后重试');
            return;
        }

        if (!verifyDecision) {
            message.error('请选择一个核验结果');
            return;
        }

        if (verifyDecision === CLUB_AI_VERIFY_RESULT.Correct && !correctReason) {
            message.error('请选择一个判定分类');
            return;
        }

        try {
            setSubmitLoading(true);
            await onOk?.({
                verifyResult: verifyDecision,
                verifyReason: correctReason,
            });
        } finally {
            setSubmitLoading(false);
        }
    };

    const renderRecommendList = () => {
        if (loading) {
            return (
                <div className="club-ai-quality-detail-modal__loading">
                    <Spin />
                </div>
            );
        }

        if (errorMessage) {
            return (
                <div className="club-ai-quality-detail-modal__loading">
                    <Empty description={errorMessage} />
                </div>
            );
        }

        if (!recommendItems.length) {
            return (
                <div className="club-ai-quality-detail-modal__loading">
                    <Empty description="暂无推荐内容" />
                </div>
            );
        }

        return (
            <div
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    position: 'relative',
                    width: '100%',
                }}
            >
                {virtualizer.getVirtualItems().map(virtualItem => {
                    const item = recommendItems[virtualItem.index];

                    return (
                        <div
                            className={`club-ai-quality-detail-modal__recommend-item${
                                item.highlighted ? ' club-ai-quality-detail-modal__recommend-item_highlighted' : ''
                            }`}
                            key={item.id}
                            ref={virtualizer.measureElement}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                transform: `translateY(${virtualItem.start}px)`,
                            }}
                        >
                            <div className="club-ai-quality-detail-modal__recommend-index">
                                {virtualItem.index + 1}.
                            </div>

                            <Popover
                                content={
                                    <div className="club-ai-quality-detail-modal__tag-popover">
                                        <div className="title">标签</div>
                                        <TagList
                                            data={item.tags}
                                            mykey={`recommend-tags-${item.id}`}
                                            renderItem
                                            showNum={10}
                                        />
                                    </div>
                                }
                            >
                                <div className="club-ai-quality-detail-modal__recommend-title">
                                    <TableCellText data={item.title} />
                                </div>
                            </Popover>

                            <Popover
                                content={
                                    <div className="club-ai-quality-detail-modal__tag-popover">
                                        <div className="title">标签</div>
                                        <TagList
                                            data={item.tags}
                                            mykey={`recommend-result-tags-${item.id}`}
                                            renderItem
                                            showNum={10}
                                        />
                                    </div>
                                }
                            >
                                <div
                                    className={`club-ai-quality-detail-modal__status club-ai-quality-detail-modal__status_${item.result}`}
                                >
                                    {ClubAiDiagnosisResultLabelMap[item.result]}
                                </div>
                            </Popover>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <Modal
            visible={visible}
            title="单个校验详情"
            getContainer={getContainer}
            onCancel={onCancel}
            maskClosable={false}
            destroyOnClose
            width={HugeConfirmModalProps.width}
            footer={
                <div className="club-ai-quality-detail-modal__footer">
                    <Space size={24}>
                        <Button onClick={onCancel}>取消</Button>
                        <Button type="primary" loading={submitLoading} onClick={handleSubmit}>
                            保存并提交至训练集
                        </Button>
                    </Space>
                </div>
            }
        >
            <div className="club-ai-quality-detail-modal">
                <div className="club-ai-quality-detail-modal__content">
                    <div className="club-ai-quality-detail-modal__panel club-ai-quality-detail-modal__profile">
                        <div className="club-ai-quality-detail-modal__panel-header">玩家画像</div>
                        <div className="club-ai-quality-detail-modal__panel-body">
                            <div className="club-ai-quality-detail-modal__field">
                                <span className="label">昵称:</span>
                                <span className="value">{detail?.nickName || '--'}</span>
                            </div>
                            <div className="club-ai-quality-detail-modal__field">
                                <span className="label">匹配标签:</span>
                                <span className="value">{detail?.matchTags?.join('、') || '--'}</span>
                            </div>
                        </div>

                        <div className="club-ai-quality-detail-modal__diagnosis">
                            <div className="club-ai-quality-detail-modal__diagnosis-title">
                                <WarningOutlined />
                                <span>AI 诊断结果:</span>
                            </div>
                            <div className="club-ai-quality-detail-modal__diagnosis-content">
                                {detail?.aiReason || '--'}
                            </div>
                        </div>
                    </div>

                    <div className="club-ai-quality-detail-modal__panel club-ai-quality-detail-modal__recommend">
                        <div className="club-ai-quality-detail-modal__panel-header">
                            推荐列表 {recommendItems.length} 条诊断
                        </div>
                        <div className="club-ai-quality-detail-modal__virtual-box" ref={parentRef}>
                            {renderRecommendList()}
                        </div>
                    </div>
                </div>

                <div className="club-ai-quality-detail-modal__result-section">
                    <div className="club-ai-quality-detail-modal__result-title">请选择校验的结果</div>

                    <div className="club-ai-quality-detail-modal__decision-buttons">
                        {ClubAiVerifyResultOptions.map(item => (
                            <Button
                                key={item.value}
                                className={
                                    verifyDecision === item.value
                                        ? 'club-ai-quality-detail-modal__decision-btn club-ai-quality-detail-modal__decision-btn_active'
                                        : 'club-ai-quality-detail-modal__decision-btn'
                                }
                                onClick={() => handleDecisionChange(item.value)}
                            >
                                {item.label}
                            </Button>
                        ))}
                    </div>

                    {verifyDecision === CLUB_AI_VERIFY_RESULT.Correct ? (
                        <Radio.Group
                            value={correctReason}
                            onChange={e => setCorrectReason(e.target.value)}
                            className="club-ai-quality-detail-modal__reason-group"
                        >
                            {ClubAiVerifyReasonOptions.map(item => (
                                <Radio key={item.value} value={item.value}>
                                    {item.label}
                                </Radio>
                            ))}
                        </Radio.Group>
                    ) : null}
                </div>
            </div>
        </Modal>
    );
}

export default ContentAuditDetailModal;
