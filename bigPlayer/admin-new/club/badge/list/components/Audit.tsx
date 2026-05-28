import { Form, Input, message, Modal, Radio, Spin } from 'antd';
import React, { useState } from 'react';
import { map } from 'lodash';

import { useContentDialogContainer } from '@/context';
import { batchAuditBadge } from '@/api/clubBadge';

import { CLUB_DEPLOY_VERSION } from '@ts/club';
import { BatchAuditOptions, BatchAuditStatus } from '@ts/enum/enum';
import { BadgeListItem } from '@ts/clubBadge';

/* 批量审核 */
interface AppearanceAuditProps {
    data: BadgeListItem[];
    visible: boolean;
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    onOk: (shouldChangeTab: boolean) => void;
    onCancel: () => void;
}

const REMARK_MAX_LENGTH = 50;
function BadgeAudit(props: AppearanceAuditProps) {
    const { data = [], visible, onCancel, clubDeployVersion, onOk } = props;

    const [ batchAuditForm ] = Form.useForm();
    const [ batchAuditLoading, setbatchAuditLoading ] = useState(false);

    const handleOk = async () => {
        try {
            setbatchAuditLoading(true);
            const values = await batchAuditForm.validateFields();
            const query = {
                boardId: data[0].boardId,
            };
            const params = {
                ...values,
                ids: map(data, 'id') as number[],
            };
            const { code, message: msg } = await batchAuditBadge(query, params, clubDeployVersion);
            if (code === 0) {
                message.success(msg || '审核成功');
                onOk(values.status === BatchAuditStatus.Pass);
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
                    <span>共审核</span> <span className="color-blue">{data.length}</span> <span>个徽章</span>
                </p>
                <Form name="batchAuditForm" form={batchAuditForm} initialValues={{ status: BatchAuditStatus.Pass }}>
                    <Form.Item name="status" label="审核结果" required>
                        <Radio.Group options={BatchAuditOptions}></Radio.Group>
                    </Form.Item>
                    <Form.Item
                        name="auditRemark"
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
                            showCount
                        />
                    </Form.Item>
                </Form>
                <p>提示：仅支持全部通过或全部拒绝，如想查看详情，请逐条查看</p>
            </Spin>
        </Modal>
    );
}

export default BadgeAudit;
