import React, { useCallback } from 'react';
import { Button, Form, message, Modal, Select, Space } from 'antd';
import { map, uniq } from 'lodash';

import { batchOperatePost } from '@/api/club';
import { useContentDialogContainer } from '@/context';

import {
    AUDIT_STATUS,
    BATCH_OPERATE_POST_TYPE,
    CLUB_DEPLOY_VERSION,
    POST_MARK,
    PostListItem,
    PostMarkOptions,
} from '@ts/club';
import { IS_ENABLE } from '@ts/enum/enum';

function normalRules(message = '请选择', required = true) {
    return [ { message, required } ];
}

interface PostMarkProps {
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    visible: boolean;
    selectedRow: Array<PostListItem>;
    onOk?: () => void;
    onCancel?: () => void;
}

const MAX_MARK_POST = 50;

function PostMark(props: PostMarkProps) {
    const [ modalForm ] = Form.useForm();
    const { clubDeployVersion, visible, selectedRow, onOk, onCancel } = props;

    const handleOk = useCallback(async () => {
        const values = await modalForm.validateFields();
        if (selectedRow.length > MAX_MARK_POST) {
            message.error('批量标记失败，单次标记条数超过50条，请重新选择！');
            return;
        }
        let isPass = selectedRow.every(item => item.status === AUDIT_STATUS.Passed);
        if (!isPass) {
            message.error('存在审核拒绝的帖子，请重新选择！');
            return;
        }
        const res = await batchOperatePost(
            { boardId: uniq(selectedRow.map(x => x.boardId)).join(',') },
            {
                post: map(selectedRow, item => ({
                    id: item.id,
                    userId: item.userId,
                    userInfoId: item.userInfoId,
                })),
                type: BATCH_OPERATE_POST_TYPE.Mark,
                operation: IS_ENABLE.Enable,
                mark: values.mark,
            },
            clubDeployVersion
        );
        if (res.code === 0) {
            message.success('操作成功');
            onOk?.();
            modalForm.resetFields();
        } else {
            message.error(res.msg || '操作失败');
        }
    }, [ clubDeployVersion, modalForm, onOk, selectedRow ]);

    return (
        <Modal
            getContainer={useContentDialogContainer()}
            title="批量标记"
            visible={visible}
            onCancel={() => {
                onCancel?.();
                modalForm.resetFields();
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
                labelCol={{ style: { width: '6em' } }}
                initialValues={{
                    mark: POST_MARK.Information,
                }}
            >
                <p style={{ marginBottom: 10 }}>
                    <span>共标记 </span>
                    <span className="color-blue">{selectedRow.length}</span>
                    <span> 个帖子</span>
                </p>
                <Form.Item required name="mark" label="标记类型" rules={normalRules('请选择标记类型！')}>
                    <Select options={PostMarkOptions} allowClear />
                </Form.Item>
            </Form>
            <p>提示：单次最多标记50条</p>
        </Modal>
    );
}

export default PostMark;
