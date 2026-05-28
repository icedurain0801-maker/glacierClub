import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, Form, Input, message, Modal, Select, Space } from 'antd';

import { auditComplaintRecord } from '@/api/club';
import { useContentDialogContainer } from '@/context';

import {
    ComplaintRecordResponse,
    CLUB_DEPLOY_VERSION,
    ComplaintResultOptions,
    COMPLAINT_AUDIT_STATUS,
    CLUB_ENVIRONMENT_ENUM,
} from '@ts/club';

interface AuditProps {
    data?: ComplaintRecordResponse[];
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    visible: boolean;
    boardId: number;
    onOk?: () => void;
    onCancel?: () => void;
}

const SUCCESS_REMARK = '经核实，您举报的内容存在侵权情况属实，已对违规内容进行相应处理，感谢您的反馈。';
const FAIL_REMARK = '举报内容和举报项不符，没有明确违反社区版规的内容。';

function Audit(props: AuditProps) {
    const [ modalForm ] = Form.useForm();
    const { data, visible, clubDeployVersion, boardId, onOk, onCancel } = props;

    useEffect(() => {
        if (visible) {
            modalForm.resetFields();
            modalForm.setFieldsValue(data);
        }
    }, [ data, modalForm, visible ]);
    const [ loading, setLoading ] = useState(false);

    const isZh = useMemo(() => {
        return clubDeployVersion === CLUB_ENVIRONMENT_ENUM.ZH;
    }, [ clubDeployVersion ]);

    const handleOk = useCallback(async () => {
        const values = await modalForm.validateFields();
        setLoading(true);
        try {
            const { code, msg } = await auditComplaintRecord(
                { boardId },
                { ...values, ids: data?.map(x => x.id) },
                clubDeployVersion
            );
            if (code === 0) {
                message.success('处理成功');
                onOk?.();
            } else {
                message.error(msg);
            }
        } finally {
            setLoading(false);
        }
    }, [ boardId, clubDeployVersion, data, modalForm, onOk ]);
    return (
        <Modal
            getContainer={useContentDialogContainer()}
            title="批量处理"
            visible={visible}
            onCancel={() => {
                onCancel?.();
            }}
            footer={
                <div style={{ textAlign: 'right' }}>
                    <Space size="large">
                        <Button
                            onClick={() => {
                                onCancel?.();
                            }}
                        >
                            取消
                        </Button>
                        <Button
                            loading={loading}
                            type="primary"
                            onClick={() => {
                                handleOk();
                            }}
                        >
                            确定
                        </Button>
                    </Space>
                </div>
            }
        >
            <Form
                form={modalForm}
                initialValues={{ auditResult: COMPLAINT_AUDIT_STATUS.Success, remark: isZh ? SUCCESS_REMARK : '' }}
            >
                <div>
                    <span>共处理</span> <b style={{ color: '#1890ff' }}>{data?.length}</b> <span>个</span>
                    <span>举报</span>
                </div>
                <br />
                <Form.Item name="auditResult" label="处理结果" rules={[ { message: '请选择', required: true } ]}>
                    <Select
                        options={ComplaintResultOptions}
                        allowClear
                        onChange={value => {
                            if (isZh) {
                                modalForm.setFieldsValue({
                                    remark: value === COMPLAINT_AUDIT_STATUS.Success ? SUCCESS_REMARK : FAIL_REMARK,
                                });
                            }
                        }}
                    />
                </Form.Item>
                <Form.Item name="remark" label="审核备注" rules={[ { message: '请输入', required: true } ]}>
                    <Input.TextArea maxLength={200} allowClear />
                </Form.Item>
                {clubDeployVersion === CLUB_ENVIRONMENT_ENUM.EN ? (
                    <p>注意：该审核备注会在C端直接通知到玩家，建议使用对应地区的语言及合理的内容文字！</p>
                ) : null}
            </Form>
        </Modal>
    );
}

export default Audit;
