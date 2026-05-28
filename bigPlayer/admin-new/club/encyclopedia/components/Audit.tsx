import { Form, Input, message, Modal, Radio, Spin } from 'antd';
import React, { useState } from 'react';
import { get, map } from 'lodash';

import { useContentDialogContainer } from '@/context';
import { auditPedia } from '@/api/club';

import { CLUB_DEPLOY_VERSION, PediaAuditOptions, PediaListResponse } from '@ts/club';

/* 批量审核 */

interface PediaAuditProps {
    data: PediaListResponse[];
    visible: boolean;
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    onOk: () => void;
    onCancel: () => void;
    userName: string;
}
const REMARK_MAX_LENGTH = 50;
function PediaAudit(props: PediaAuditProps) {
    const { data = [], visible, userName, onOk, onCancel, clubDeployVersion } = props;

    const [ batchAuditForm ] = Form.useForm();
    const [ batchAuditLoading, setbatchAuditLoading ] = useState(false);

    const handleOk = async () => {
        try {
            setbatchAuditLoading(true);
            const values = await batchAuditForm.validateFields();
            const { code, message: msg } = await auditPedia(
                { boardId: get(data, '0.boardId') },
                {
                    ...values,
                    updateBy: userName,
                    ids: map(data, 'id'),
                },
                clubDeployVersion
            );
            if (code === 0) {
                message.success(msg || '审核成功');
                onOk();
                setTimeout(() => {
                    batchAuditForm.resetFields();
                }, 100);
            } else {
                message.error(msg || '审核失败');
            }
        } finally {
            setbatchAuditLoading(false);
        }
    };
    return (
        <Modal
            getContainer={useContentDialogContainer()}
            title="批量审核"
            visible={visible}
            onOk={handleOk}
            onCancel={() => {
                onCancel();
                setTimeout(() => {
                    batchAuditForm.resetFields();
                }, 100);
            }}
        >
            <Spin spinning={batchAuditLoading}>
                <p className="batch-audit-tip">
                    <span>共审核</span> <span className="color-blue">{data.length}</span> <span>个攻略</span>
                </p>
                <Form name="batchAuditForm" form={batchAuditForm} initialValues={{ status: 1 }}>
                    <Form.Item name="status" label="审核结果" required>
                        <Radio.Group options={PediaAuditOptions}></Radio.Group>
                    </Form.Item>
                    <Form.Item
                        name="remark"
                        label="审核备注"
                        rules={[
                            {
                                required: true,
                                message: '请填写审核备注！',
                                transform: v => v && v.trim(),
                            },
                        ]}
                    >
                        <Input.TextArea
                            placeholder={`仅输入${REMARK_MAX_LENGTH}个汉字`}
                            maxLength={REMARK_MAX_LENGTH}
                        />
                    </Form.Item>
                </Form>
                <p>提示：仅支持全部通过或全部拒绝，如想查看详情，请逐条查看</p>
            </Spin>
        </Modal>
    );
}

export default PediaAudit;
