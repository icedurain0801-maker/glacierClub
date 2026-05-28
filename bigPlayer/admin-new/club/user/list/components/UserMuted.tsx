import React, { useEffect, useCallback } from 'react';
import { Button, Form, Input, message, Modal, Radio, Select, Space } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

import { changeUserinfoStatus } from '@/api/club';
import { useContentDialogContainer } from '@/context';

import {
    CLUB_DEPLOY_VERSION,
    DateTypeOptionsData,
    DateValueOptionsData,
    DATE_TYPE,
    DATE_VALUE,
    UesrstatusOptionsData,
    UserinfoListResponse,
} from '@ts/club';

import { FormOnlyVisiable } from './UserEdit';

/** 封禁原因最大长度 */
const MUTED_REMARK_LENGTH_MAX = 120;

function normalRules(message = '请选择', required = true) {
    return [ { message, required } ];
}

/** 封禁提示 */
interface UserMutedProps {
    data?: UserinfoListResponse;
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    visible: boolean;
    onOk?: () => void;
    onCancel?: () => void;
}

function UserMuted(props: UserMutedProps) {
    const [ modalForm ] = Form.useForm();
    const { data, visible, onOk, onCancel, clubDeployVersion } = props;

    useEffect(() => {
        if (visible) {
            modalForm.setFieldsValue(data);
        }
    }, [ data, modalForm, visible ]);

    // 解禁
    const handleForbid = useCallback(
        record => {
            Modal.confirm({
                title: '封禁提示',
                icon: <InfoCircleOutlined />,
                content: <div>确认将【{record?.userName}】封禁吗？</div>,
                okText: '确定',
                okType: 'primary',
                cancelText: '取消',
                onOk: async function () {
                    const { code, msg } = await changeUserinfoStatus(
                        { boardId: String(data?.boardId) },
                        record,
                        clubDeployVersion
                    );
                    if (code === 0) {
                        message.success('封禁成功');
                        onOk?.();
                    } else {
                        message.error(msg);
                    }
                },
                onCancel: function () {},
                autoFocusButton: 'ok',
            });
        },
        [ clubDeployVersion, data, onOk ]
    );

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

    const handleOk = useCallback(async () => {
        const values = await modalForm.validateFields();
        await handleForbid(values);
    }, [ handleForbid, modalForm ]);

    return (
        <Modal
            getContainer={useContentDialogContainer()}
            title="封禁提示"
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
            <Form form={modalForm} onValuesChange={onValuesChange}>
                <Form.Item name="userName" label="冰川通行证名称">
                    <FormOnlyVisiable />
                </Form.Item>

                <Form.Item name="userInfoId" label="用户自增id" hidden>
                    <FormOnlyVisiable />
                </Form.Item>
                <Form.Item name="userStatsId" label="用户id" hidden>
                    <FormOnlyVisiable />
                </Form.Item>
                <Form.Item name="status" label="封禁状态" hidden>
                    <Select options={UesrstatusOptionsData} allowClear />
                </Form.Item>
                <Form.Item name="dateType" label="封禁时间类型" hidden>
                    <Select options={DateTypeOptionsData} allowClear />
                </Form.Item>
                <Form.Item name="dateValue" label="封禁时间" rules={normalRules()}>
                    <Radio.Group options={DateValueOptionsData} />
                </Form.Item>
                <Form.Item name="remark" label="封禁原因" rules={normalRules('请输入')} normalize={val => val?.trim()}>
                    <Input.TextArea maxLength={MUTED_REMARK_LENGTH_MAX} allowClear />
                </Form.Item>
            </Form>
        </Modal>
    );
}

export default UserMuted;
