import React, { useEffect, useCallback } from 'react';
import { Button, Form, message, Modal, Radio, Select, Space } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

import { commentToTop } from '@/api/club';

import {
    CLUB_DEPLOY_VERSION,
    CommentListItem,
    DateTypeOptionsData,
    DateValueOptionsData,
    DATE_TYPE,
    DATE_VALUE,
} from '@ts/club';

import PostContent from '../../components/PostContent';
function normalRules(message = '请选择', required = true) {
    return [ { message, required } ];
}

/** 封禁提示 */
interface UserMutedProps {
    data?: CommentListItem;
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    visible: boolean;
    onOk?: () => void;
    onCancel?: () => void;
}

function UserMuted(props: UserMutedProps) {
    const [ modalForm ] = Form.useForm();
    const { data, clubDeployVersion, visible, onOk, onCancel } = props;

    useEffect(() => {
        if (visible) {
            modalForm.setFieldsValue(data);
        }
    }, [ data, modalForm, visible ]);

    // 置顶
    const handleForbid = useCallback(
        values => {
            Modal.confirm({
                title: '系统提示',
                icon: <InfoCircleOutlined />,
                content: (
                    <div>
                        <span>确认将评论</span>【{data?.id}】<span> 置顶吗</span>？
                    </div>
                ),
                okText: '确定',
                okType: 'primary',
                cancelText: '取消',
                onOk: async function () {
                    let query = { boardId: [ data?.boardId ].join(',') };
                    const res = await commentToTop(
                        query,
                        {
                            id: data?.id,
                            isTop: 1,
                            userId: data?.userId,
                            userInfoId: data?.userInfoId,
                            ...values,
                        },
                        clubDeployVersion
                    );
                    if (res.code === 0) {
                        message.success('置顶操作成功');
                        onOk?.();
                    } else {
                        message.error(res.msg || '置顶操作失败');
                    }
                },
                onCancel: function () {},
                autoFocusButton: 'ok',
            });
        },
        [ clubDeployVersion, data, onOk ]
    );
    const handleOk = useCallback(async () => {
        const values = await modalForm.validateFields();
        await handleForbid(values);
    }, [ handleForbid, modalForm ]);
    const onValuesChange = useCallback(
        async val => {
            if ('dateValue' in val) {
                modalForm.setFields([
                    {
                        name: 'dateType',
                        value: val.dateValue === DATE_VALUE.Forever ? DATE_TYPE.Forever : DATE_TYPE.Day,
                    },
                ]);
            }
        },
        [ modalForm ]
    );
    return (
        <Modal
            title="置顶提示"
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
            <Form form={modalForm} labelCol={{ span: 5 }} onValuesChange={onValuesChange}>
                <Form.Item label="评论内容">
                    <PostContent {...(data as any)} showOriginImage={true} />
                </Form.Item>

                <Form.Item name="dateType" label="置顶时间类型" hidden>
                    <Select options={DateTypeOptionsData} allowClear />
                </Form.Item>
                <Form.Item name="dateValue" label="置顶时间" rules={normalRules()}>
                    <Radio.Group options={DateValueOptionsData} />
                </Form.Item>
            </Form>
        </Modal>
    );
}

export default UserMuted;
