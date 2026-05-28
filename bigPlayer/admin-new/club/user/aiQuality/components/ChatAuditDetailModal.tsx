import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Form, Input, Modal, Space, message } from 'antd';

import { getOptimizeAnswer } from '@/api/clubQuality';
import { useContentDialogContainer } from '@/context';
import { HugeConfirmModalProps } from '@/utils/defaultProps';
import { simpleTime } from '@/utils/date';

import {
    CLUB_AI_CHAT_VERIFY_RESULT,
    ClubAiChatAuditDetailRecord,
    ClubAiChatAuditFormValues,
    ClubAiChatVerifyCategoryOptions,
    ClubAiChatVerifyResultOptions,
    CLUB_AI_CHAT_VERIFY_CATEGORY,
} from '@ts/clubQuality';
import { CLUB_DEPLOY_VERSION } from '@ts/club';
import { tryToParseJson } from '@ts/lib';

import { VerifyListRow } from './verifyList';

import './ChatAuditDetailModal.less';

interface ChatAuditDetailModalProps {
    visible: boolean;
    record: VerifyListRow | null;
    boardId?: string | number;
    clubDeployVersion?: CLUB_DEPLOY_VERSION;
    onCancel?: () => void;
    onOk?: (values: ClubAiChatAuditFormValues) => void | Promise<void>;
}

interface ParsedChatPayload {
    question: string;
    originalAnswer: string;
    detailRecord: ClubAiChatAuditDetailRecord;
}

function ChatAuditDetailModal(props: ChatAuditDetailModalProps) {
    const { visible, record, boardId, clubDeployVersion, onCancel, onOk } = props;
    const getContainer = useContentDialogContainer();
    const [ form ] = Form.useForm<ClubAiChatAuditFormValues>();
    const [ loading, setLoading ] = useState(false);
    const [ optimizing, setOptimizing ] = useState(false);
    const optimizeRequestIdRef = useRef(0);

    const chatDetailData = useMemo<ParsedChatPayload>(() => {
        const chatMsg = tryToParseJson(record?.userChatSession, {
            User: '',
            System: '',
            UserTime: null,
            SystemTime: null,
            robotName: '',
        });

        const question = record?.chatSession?.user || chatMsg.User || '';
        const originalAnswer = record?.chatSession?.system || chatMsg.System || '';
        const userTime = record?.chatSession?.userTime ?? chatMsg.UserTime;
        const systemTime = record?.chatSession?.systemTime ?? chatMsg.SystemTime;
        const robotName = chatMsg.robotName || 'AI';

        return {
            question,
            originalAnswer,
            detailRecord: {
                diagnosis: record?.aiReason ?? '',
                dialogues: [
                    {
                        id: '1',
                        role: 'user',
                        sender: record?.nickName ?? '',
                        time: simpleTime(userTime) as string,
                        content: question,
                    },
                    {
                        id: '2',
                        role: 'assistant',
                        sender: robotName,
                        time: simpleTime(systemTime) as string,
                        content: originalAnswer,
                        badcase: true,
                    },
                ],
            },
        };
    }, [ record ]);

    const fetchOptimizedAnswer = useCallback(async () => {
        if (!visible || !record?.checkId || boardId === undefined || !clubDeployVersion) {
            return;
        }

        const question = chatDetailData.question.trim();
        const originalAnswer = chatDetailData.originalAnswer.trim();

        if (!question || !originalAnswer) {
            return;
        }

        const requestId = optimizeRequestIdRef.current + 1;
        optimizeRequestIdRef.current = requestId;
        setOptimizing(true);

        try {
            const res = await getOptimizeAnswer({ boardId }, { originalAnswer, question }, clubDeployVersion);

            if (optimizeRequestIdRef.current !== requestId) {
                return;
            }

            form.setFieldsValue({
                manualCorrection: res?.data || '',
            });
        } catch (error) {
            if (optimizeRequestIdRef.current === requestId) {
                message.error('生成标准回答失败');
            }
        } finally {
            if (optimizeRequestIdRef.current === requestId) {
                setOptimizing(false);
            }
        }
    }, [
        visible,
        record?.checkId,
        boardId,
        clubDeployVersion,
        chatDetailData.question,
        chatDetailData.originalAnswer,
        form,
    ]);

    useEffect(() => {
        if (!visible) {
            optimizeRequestIdRef.current += 1;
            setOptimizing(false);
            form.resetFields();
        }
    }, [ form, visible ]);

    const handleVerifyResultChange = (value: CLUB_AI_CHAT_VERIFY_RESULT) => {
        if (value === CLUB_AI_CHAT_VERIFY_RESULT.NeedManualCorrection) {
            form.setFieldsValue({
                verifyResult: value,
                checkType: form.getFieldValue('checkType'),
            });
            return;
        }

        if (value === CLUB_AI_CHAT_VERIFY_RESULT.BadCorpusOnly) {
            form.setFieldsValue({
                verifyResult: value,
                checkType: form.getFieldValue('checkType'),
            });
            fetchOptimizedAnswer();
            return;
        }

        form.setFieldsValue({
            verifyResult: value,
            manualCorrection: undefined,
        });
    };

    const handleSubmit = async () => {
        try {
            setLoading(true);
            const values = await form.validateFields();
            await onOk?.({
                ...values,
                manualCorrection: values.manualCorrection,
            });
        } finally {
            setLoading(false);
        }
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
                <div className="club-ai-quality-chat-detail__footer">
                    <Space size={24}>
                        <Button onClick={onCancel}>取消</Button>
                        <Button type="primary" loading={loading} onClick={handleSubmit}>
                            保存并提交至训练集
                        </Button>
                    </Space>
                </div>
            }
        >
            <div className="club-ai-quality-chat-detail">
                <div className="club-ai-quality-chat-detail__content">
                    <div className="club-ai-quality-chat-detail__left">
                        <div className="club-ai-quality-chat-detail__panel">
                            <div className="club-ai-quality-chat-detail__panel-header">对话回放</div>
                            <div className="club-ai-quality-chat-detail__conversation">
                                {chatDetailData.detailRecord.dialogues.map(item => (
                                    <div
                                        key={item.id}
                                        className={`club-ai-quality-chat-detail__message club-ai-quality-chat-detail__message_${item.role}`}
                                    >
                                        <div className="club-ai-quality-chat-detail__message-meta">
                                            <span>{item.sender}</span>
                                            <span>{item.time}</span>
                                            {item.badcase ? (
                                                <span className="club-ai-quality-chat-detail__badcase">badcase</span>
                                            ) : null}
                                        </div>
                                        <div className="club-ai-quality-chat-detail__bubble">{item.content}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="club-ai-quality-chat-detail__diagnosis">
                            <div className="club-ai-quality-chat-detail__diagnosis-title">AI诊断</div>
                            <div className="club-ai-quality-chat-detail__diagnosis-card">
                                <div className="club-ai-quality-chat-detail__diagnosis-label">诊断报告:</div>
                                <div>{chatDetailData.detailRecord.diagnosis}</div>
                            </div>
                        </div>
                    </div>

                    <Form<ClubAiChatAuditFormValues>
                        form={form}
                        initialValues={{
                            verifyResult: CLUB_AI_CHAT_VERIFY_RESULT.NeedManualCorrection,
                            checkType: [ CLUB_AI_CHAT_VERIFY_CATEGORY.FactError ],
                        }}
                        className="club-ai-quality-chat-detail__form"
                    >
                        <div className="club-ai-quality-chat-detail__form-section">
                            <div className="club-ai-quality-chat-detail__section-title">请选择校验结果</div>
                            <Form.Item
                                name="verifyResult"
                                noStyle
                                rules={[ { required: true, message: '请选择校验结果' } ]}
                            >
                                <div className="club-ai-quality-chat-detail__result-buttons">
                                    {ClubAiChatVerifyResultOptions.map(item => (
                                        <Form.Item
                                            key={item.value}
                                            shouldUpdate={(prevValues, currentValues) =>
                                                prevValues.verifyResult !== currentValues.verifyResult
                                            }
                                            noStyle
                                        >
                                            {({ getFieldValue }) => {
                                                const active = getFieldValue('verifyResult') === item.value;

                                                return (
                                                    <Button
                                                        className={
                                                            active
                                                                ? 'club-ai-quality-chat-detail__result-btn club-ai-quality-chat-detail__result-btn_active'
                                                                : 'club-ai-quality-chat-detail__result-btn'
                                                        }
                                                        onClick={() => handleVerifyResultChange(item.value)}
                                                    >
                                                        {item.label}
                                                    </Button>
                                                );
                                            }}
                                        </Form.Item>
                                    ))}
                                </div>
                            </Form.Item>
                        </div>

                        <Form.Item
                            shouldUpdate={(prevValues, currentValues) =>
                                prevValues.verifyResult !== currentValues.verifyResult
                            }
                            noStyle
                        >
                            {({ getFieldValue }) => {
                                const verifyResult = getFieldValue('verifyResult');
                                const shouldShowCategories = [
                                    CLUB_AI_CHAT_VERIFY_RESULT.NeedManualCorrection,
                                    CLUB_AI_CHAT_VERIFY_RESULT.BadCorpusOnly,
                                ].includes(verifyResult);

                                if (!shouldShowCategories) {
                                    return null;
                                }

                                return (
                                    <div className="club-ai-quality-chat-detail__form-section">
                                        <div className="club-ai-quality-chat-detail__section-title">判定分类</div>
                                        <Form.Item
                                            name="checkType"
                                            rules={[
                                                {
                                                    validator: async (_, value) => {
                                                        if (value?.length) {
                                                            return Promise.resolve();
                                                        }

                                                        return Promise.reject('请选择判定分类');
                                                    },
                                                },
                                            ]}
                                        >
                                            <Checkbox.Group
                                                className="club-ai-quality-chat-detail__category-group"
                                                options={ClubAiChatVerifyCategoryOptions}
                                            />
                                        </Form.Item>
                                    </div>
                                );
                            }}
                        </Form.Item>

                        <Form.Item
                            shouldUpdate={(prevValues, currentValues) =>
                                prevValues.verifyResult !== currentValues.verifyResult
                            }
                            noStyle
                        >
                            {({ getFieldValue }) => {
                                const verifyResult = getFieldValue('verifyResult');
                                const shouldShowManualCorrection = [
                                    CLUB_AI_CHAT_VERIFY_RESULT.NeedManualCorrection,
                                    CLUB_AI_CHAT_VERIFY_RESULT.BadCorpusOnly,
                                ].includes(verifyResult);
                                const shouldShowRefreshButton =
                                    verifyResult === CLUB_AI_CHAT_VERIFY_RESULT.BadCorpusOnly;

                                if (!shouldShowManualCorrection) {
                                    return null;
                                }

                                return (
                                    <div className="club-ai-quality-chat-detail__form-section">
                                        <div className="club-ai-quality-chat-detail__section-title">人工纠正</div>
                                        <div className="club-ai-quality-chat-detail__manual-tip-row">
                                            <div className="club-ai-quality-chat-detail__manual-tip">
                                                请输入这情境下的标准回答
                                            </div>
                                            {shouldShowRefreshButton ? (
                                                <Button
                                                    type="link"
                                                    className="club-ai-quality-chat-detail__manual-refresh"
                                                    loading={optimizing}
                                                    onClick={fetchOptimizedAnswer}
                                                >
                                                    刷新
                                                </Button>
                                            ) : null}
                                        </div>
                                        <Form.Item
                                            name="manualCorrection"
                                            rules={[
                                                {
                                                    required: true,
                                                    message: '请输入人工纠正',
                                                    transform: value => value && value.trim(),
                                                },
                                            ]}
                                        >
                                            <Input.TextArea rows={7} maxLength={500} disabled={optimizing} />
                                        </Form.Item>
                                    </div>
                                );
                            }}
                        </Form.Item>
                    </Form>
                </div>
            </div>
        </Modal>
    );
}

export default ChatAuditDetailModal;
