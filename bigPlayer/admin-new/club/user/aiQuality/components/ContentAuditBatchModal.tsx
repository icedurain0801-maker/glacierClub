import React, { useEffect, useState } from 'react';
import { Button, Form, Input, Modal, Select, Space } from 'antd';

import { useContentDialogContainer } from '@/context';

import {
    CLUB_AI_VERIFY_REASON,
    CLUB_AI_VERIFY_RESULT,
    ClubAiContentBatchAuditFormValues,
    ClubAiVerifyReasonOptions,
    ClubAiVerifyResultOptions,
} from '@ts/clubQuality';

import './ContentAuditBatchModal.less';

interface ContentAuditBatchModalProps {
    visible: boolean;
    count: number;
    onCancel?: () => void;
    onOk?: (values: ClubAiContentBatchAuditFormValues) => void | Promise<void>;
}

const INITIAL_VALUES: ClubAiContentBatchAuditFormValues = {
    resultStatus: CLUB_AI_VERIFY_RESULT.Correct,
    checkType: CLUB_AI_VERIFY_REASON.BadContent,
};

function ContentAuditBatchModal(props: ContentAuditBatchModalProps) {
    const { visible, count, onCancel, onOk } = props;
    const getContainer = useContentDialogContainer();
    const [ form ] = Form.useForm<ClubAiContentBatchAuditFormValues>();
    const [ loading, setLoading ] = useState(false);

    useEffect(() => {
        if (!visible) {
            form.resetFields();
            return;
        }

        form.setFieldsValue(INITIAL_VALUES);
    }, [ form, visible ]);

    const handleResultChange = (value: CLUB_AI_VERIFY_RESULT) => {
        if (value === CLUB_AI_VERIFY_RESULT.Correct) {
            form.setFieldsValue({
                resultStatus: value,
                checkType: form.getFieldValue('checkType') || CLUB_AI_VERIFY_REASON.BadContent,
            });
            return;
        }

        form.setFieldsValue({
            resultStatus: value,
            checkType: undefined,
        });
    };

    const handleSubmit = async () => {
        try {
            setLoading(true);
            const values = await form.validateFields();

            await onOk?.(values);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            getContainer={getContainer}
            title="批量审核"
            visible={visible}
            onCancel={onCancel}
            maskClosable={false}
            destroyOnClose
            footer={
                <div className="club-ai-quality-batch-modal__footer">
                    <Space size="large">
                        <Button onClick={onCancel}>取消</Button>
                        <Button loading={loading} type="primary" onClick={handleSubmit}>
                            确定
                        </Button>
                    </Space>
                </div>
            }
        >
            <Form<ClubAiContentBatchAuditFormValues> form={form} initialValues={INITIAL_VALUES} layout="horizontal">
                <div className="club-ai-quality-batch-modal__count">
                    <span>共审核</span>
                    <span className="club-ai-quality-batch-modal__count-num">{count}</span>
                    <span>个Badcase</span>
                </div>

                <Form.Item label="审核结果" name="resultStatus" rules={[ { required: true, message: '请选择审核结果' } ]}>
                    <Select options={ClubAiVerifyResultOptions} onChange={handleResultChange} />
                </Form.Item>

                <Form.Item
                    shouldUpdate={(prevValues, currentValues) => prevValues.resultStatus !== currentValues.resultStatus}
                    noStyle
                >
                    {({ getFieldValue }) => {
                        const resultStatus = getFieldValue('resultStatus');

                        if (resultStatus !== CLUB_AI_VERIFY_RESULT.Correct) {
                            return null;
                        }

                        return (
                            <Form.Item
                                label="判定分类"
                                name="checkType"
                                rules={[ { required: true, message: '请选择判定分类' } ]}
                            >
                                <Select options={ClubAiVerifyReasonOptions} />
                            </Form.Item>
                        );
                    }}
                </Form.Item>
                <div className="club-ai-quality-batch-modal__tip">
                    提示：仅支持全部通过或全部拒绝，如想查看详情，请逐条查看
                </div>
            </Form>
        </Modal>
    );
}

export default ContentAuditBatchModal;
