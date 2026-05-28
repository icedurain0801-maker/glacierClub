import React, { useCallback } from 'react';
import { Button, Form, message, Modal, Select, Space } from 'antd';
import { map, uniq } from 'lodash';

import { postRating } from '@/api/club';
import { useContentDialogContainer } from '@/context';

import { AUDIT_STATUS, CLUB_DEPLOY_VERSION, POST_RATING, PostListItem, PostRatingOptions } from '@ts/club';

function normalRules(message = '请选择', required = true) {
    return [ { message, required } ];
}

/** 帖子评级 */
interface PostRatingProps {
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    visible: boolean;
    selectedRow: Array<PostListItem>;
    onOk?: () => void;
    onCancel?: () => void;
}

const MAX_RATING_POST = 50;

function PostRating(props: PostRatingProps) {
    const [ modalForm ] = Form.useForm();
    const { clubDeployVersion, visible, selectedRow, onOk, onCancel } = props;

    const handleOk = useCallback(async () => {
        const values = await modalForm.validateFields();
        if (selectedRow.length > MAX_RATING_POST) {
            message.error('评审失败，单次评审条数超过50项，请重新选择！');
            return;
        }
        let isPass = selectedRow.every(item => item.status === AUDIT_STATUS.Passed);
        if (!isPass) {
            message.error('存在审核拒绝的帖子，请重新选择！');
            return;
        }
        let query = { boardId: uniq(selectedRow.map(x => x.boardId)).join(',') };
        const res = await postRating(
            query,
            {
                ids: map(selectedRow, item => item.id),
                rating: values.rating,
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
            title="批量评级"
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
                labelCol={{ style: { width: '4em' } }}
                initialValues={{
                    rating: POST_RATING.SPLUS,
                }}
            >
                <p style={{ marginBottom: 10 }}>
                    <span>共评审</span>
                    <span className="color-blue">{selectedRow.length}</span>
                    <span>个帖子</span>
                </p>
                <Form.Item required name="rating" label="评级" rules={normalRules('请选择评级！')}>
                    <Select options={PostRatingOptions} allowClear />
                </Form.Item>
            </Form>
            <p>提示：单次最多评审50项</p>
        </Modal>
    );
}

export default PostRating;
