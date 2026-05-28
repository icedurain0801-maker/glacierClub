import React, { useState, useEffect, useCallback } from 'react';
import { Button, Form, Input, message, Modal, Select, Space } from 'antd';

import { userAudit } from '@/api/club';
import { useContentDialogContainer } from '@/context';

import { AUDIT_STATUS, AvatarListType, CLUB_DEPLOY_VERSION, recordStatusOptionsData } from '@ts/club';

interface AuditProps {
    data?: AvatarListType[];
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    visible: boolean;
    onOk?: () => void;
    onCancel?: () => void;
    clubBoard: number;
}

function Audit(props: AuditProps) {
    const [ modalForm ] = Form.useForm();
    const { data, visible, clubDeployVersion, clubBoard, onOk, onCancel } = props;

    useEffect(() => {
        if (visible) {
            modalForm.resetFields();
            modalForm.setFieldsValue(data);
        }
    }, [ data, modalForm, visible ]);
    const [ loading, setLoading ] = useState(false);

    const handleOk = useCallback(async () => {
        const values = await modalForm.validateFields();
        setLoading(true);
        try {
            const { code, msg } = await userAudit(
                { boardId: String(clubBoard) },
                { ...values, ids: data?.map(x => x.id) },
                'avatar',
                clubDeployVersion
            );
            if (code === 0) {
                message.success(msg);
                onOk?.();
            } else {
                message.error(msg);
            }
        } finally {
            setLoading(false);
        }
    }, [ clubBoard, clubDeployVersion, data, modalForm, onOk ]);
    return (
        <Modal
            getContainer={useContentDialogContainer()}
            title="批量审核"
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
            <Form form={modalForm} initialValues={{ status: AUDIT_STATUS.Passed }}>
                <div>
                    <span>共审核</span> <b style={{ color: '#1890ff' }}>{data?.length}</b> <span>个</span>
                    <span>头像</span>
                </div>
                <br />
                <Form.Item name="status" label="审核结果" rules={[ { message: '请选择', required: true } ]}>
                    <Select options={recordStatusOptionsData} allowClear />
                </Form.Item>
                <Form.Item name="remark" label="审核备注" rules={[ { message: '请输入', required: true } ]}>
                    <Input.TextArea maxLength={128} allowClear />
                </Form.Item>
            </Form>
        </Modal>
    );
}

export default Audit;
