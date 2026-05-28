import React, { useState, useEffect, useCallback, memo } from 'react';
import { Button, Form, message, Modal, Select, Space, TreeSelect } from 'antd';
import { inject, observer } from 'mobx-react';

import { StoreType } from '@/store/config';
import { editUserinfo } from '@/api/club';
import { useContentDialogContainer } from '@/context';

import { CLUB_DEPLOY_VERSION, UserinfoListResponse } from '@ts/club';

/** TODOS:可以在这里做一下转换之类的，目前不知道返回格式，暂时不做处理 */
export const FormOnlyVisiable = memo(
    (props: any) => {
        const { value } = props;
        return <>{value}</>;
    },
    (pre, next) => pre?.value === next?.value
);

interface UserEditProps {
    data?: UserinfoListResponse;
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    visible: boolean;
    onOk?: () => void;
    onCancel?: () => void;
    userRoleTypeOptions: any;
    labelTypeOptions: any;
}
interface UserEditMobxProps extends UserEditProps, Pick<StoreType, 'Club'> {}
function UserEdit(props: UserEditProps) {
    const [ modalForm ] = Form.useForm();
    const {
        data,
        visible,
        onOk,
        onCancel,
        clubDeployVersion,
        userRoleTypeOptions,
        labelTypeOptions,
    } = props as UserEditMobxProps;

    useEffect(() => {
        if (visible) {
            modalForm.setFieldsValue(data);
        }
    }, [ data, modalForm, visible ]);
    const [ loading, setLoading ] = useState(false);

    const handleOk = useCallback(async () => {
        const values = await modalForm.validateFields();
        setLoading(true);
        try {
            const { code, msg } = await editUserinfo({ boardId: String(data?.boardId) }, values, clubDeployVersion);
            if (code === 0) {
                message.success(msg);
                onOk?.();
            } else {
                message.error(msg);
            }
        } finally {
            setLoading(false);
        }
    }, [ clubDeployVersion, data, modalForm, onOk ]);
    return (
        <Modal
            getContainer={useContentDialogContainer()}
            title="用户编辑"
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
            <Form form={modalForm}>
                <Form.Item name="userName" label="冰川通行证名称">
                    <FormOnlyVisiable />
                </Form.Item>

                <Form.Item name="userInfoId" label="用户自增id" hidden>
                    <FormOnlyVisiable />
                </Form.Item>
                <Form.Item name="userStatsId" label="版块用户id" hidden>
                    <FormOnlyVisiable />
                </Form.Item>
                <Form.Item name="roleId" label="用户分组" rules={[ { message: '请选择', required: true } ]}>
                    <Select options={userRoleTypeOptions} allowClear />
                </Form.Item>
                <Form.Item name="labelId" label="用户标签" rules={[ { message: '请选择', required: true } ]}>
                    <TreeSelect treeData={labelTypeOptions} allowClear treeDefaultExpandAll />
                </Form.Item>
            </Form>
        </Modal>
    );
}

export default inject('Club')(observer(UserEdit));
