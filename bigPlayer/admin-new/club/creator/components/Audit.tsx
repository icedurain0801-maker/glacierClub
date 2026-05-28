import { Form, Input, message, Modal, Radio, Spin } from 'antd';
import React, { useState } from 'react';
import { get, map } from 'lodash';

import { useContentDialogContainer } from '@/context';
import { batchAuditCreator, batchAuditCreatorTask } from '@/api/club';

import { CREATOR_AUDIT_TYPE, CreatorAuditOptions } from '@ts/creator';
import { CLUB_DEPLOY_VERSION } from '@ts/club';

/* 批量审核 */

interface CreatorAuditProps {
    data: any[];
    visible: boolean;
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    onOk: (shouldChangeTab: boolean) => void;
    onCancel: () => void;
    userName: string;
    pageType: 'list' | 'task';
}
const REMARK_MAX_LENGTH = 50;
function CreatorAudit(props: CreatorAuditProps) {
    const { data = [], visible, onOk, onCancel, clubDeployVersion, pageType } = props;

    const [ batchAuditForm ] = Form.useForm();
    const [ batchAuditLoading, setbatchAuditLoading ] = useState(false);

    const handleOk = async () => {
        try {
            setbatchAuditLoading(true);
            const { status, remark } = await batchAuditForm.validateFields();
            const params: any =
                pageType === 'task'
                    ? {
                          remark,
                          status,
                          ids: map(data, 'id') as number[],
                      }
                    : {
                          remark,
                          status: status === CREATOR_AUDIT_TYPE.Pass ? status : 2,
                          ids: map(data, 'id') as number[],
                          userIds: map(data, 'userId'),
                      };
            const { code, message: msg } =
                pageType === 'task'
                    ? await batchAuditCreatorTask({ boardId: get(data, '0.boardId') }, params, clubDeployVersion)
                    : await batchAuditCreator(params, clubDeployVersion);
            if (code === 0) {
                message.success(msg || '审核成功');
                onOk(status === CREATOR_AUDIT_TYPE.Pass);
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
                    <span>共审核</span> <span className="color-blue">{data.length}</span>{' '}
                    <span>个{pageType === 'list' ? '创作者' : '创作任务'}</span>
                </p>
                <Form name="batchAuditForm" form={batchAuditForm} initialValues={{ status: 1 }}>
                    <Form.Item name="status" label="审核结果" required>
                        <Radio.Group options={CreatorAuditOptions}></Radio.Group>
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
                            showCount
                        />
                    </Form.Item>
                </Form>
                <p>提示：仅支持全部通过或全部拒绝，如想查看详情，请逐条查看</p>
            </Spin>
        </Modal>
    );
}

export default CreatorAudit;
