import { Button, Form, FormInstance, FormItemProps, Input, message, Space } from 'antd';
import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { find } from 'lodash';

import { checkUserId } from '@/api/club';

import { CheckSenderList, CLUB_DEPLOY_VERSION } from '@ts/club';

import CheckRoleTable from './CheckRoleTable';

interface ActorCheckFormProps extends FormItemProps {
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    boardId: string | number;
    form: FormInstance;
    name: string;
    isPushAllFormName: string; // 推送范围表单名 用于校验角色前校验推送范围
    isEdit?: boolean; // 是否编辑
    validUser?: Array<CheckSenderList>; // 初始化已校验通过的角色
    textAreaPlaceholder?: string;
    setValidatedRoles: (roles: Array<CheckSenderList>) => void; // 设置校验通过的角色
    rolesValidated: boolean; // 表单校验角色状态
    setRolesValidated: (val: boolean) => void; // 设置表单角色校验状态
    shouldValidate?: boolean;
}

export interface ActorCheckFormRef {
    handleValidateRoles: (showTip: boolean) => void; // 触发校验函数
}

/**
 * @return Object {inexistentIds,eligibleIds} 不存在的,合格的
 * */
export function getInexistentRoles(roleIds: number[], roles: CheckSenderList[] = []) {
    if (!roleIds || !Array.isArray(roles)) {
        return { inexistentIds: [], eligibleIds: [] };
    }
    const inexistentIds: any[] = [];
    const eligibleIds: any[] = [];
    const idArr = roleIds;
    idArr?.forEach(id => {
        const role = find(roles, { ActorID: id });
        if (role) {
            eligibleIds.push(role);
        } else {
            inexistentIds.push(role);
        }
    });
    return {
        inexistentIds,
        eligibleIds,
    };
}

const ActorCheckForm = React.forwardRef<ActorCheckFormRef, ActorCheckFormProps>(function ActorCheckForm(props, ref) {
    const {
        boardId,
        clubDeployVersion,
        form,
        name,
        isPushAllFormName,
        label,
        isEdit,
        validUser,
        setValidatedRoles,
        rolesValidated,
        setRolesValidated,
        textAreaPlaceholder,
        shouldValidate = false,
        ...reset
    } = props;

    // 校验角色失败提示
    const errorMsgRef = useRef('');
    const [ allValidatedRoles, setAllValidatedRoles ] = useState<CheckSenderList[]>(validUser ?? []); // 所有角色信息
    const [ receiverIdMsg, setReceiverIdMsg ] = useState('');
    const [ validateLoading, setValidateLoading ] = useState(false);

    // 校验收件人角色ID
    const handleValidateRoles = useCallback(
        // eslint-disable-next-line complexity
        async (showTip: boolean = true) => {
            const isPushAll = form.getFieldValue(isPushAllFormName);
            // 区服类型为选择区服但是没有选择
            if (isPushAll === undefined) {
                message.warn('请先完善区服信息！');
                return;
            }
            // 校验角色ID重复--做多一个弹窗的提示---start
            const receiverId = form.getFieldValue(name) || '';
            form.validateFields([ name ]);
            if (!receiverId) {
                return;
            }

            let checkUnin: any[] = [];
            const _arr = receiverId.split(',');
            _arr.forEach((x: string, xi: number) => {
                if (_arr.indexOf(x) !== xi) {
                    checkUnin.push(x);
                }
            });
            checkUnin = Array.from(new Set(checkUnin));
            if (checkUnin.length) {
                message.error(`冰川通行证ID【${checkUnin.join(',')}】重复`);
                return;
            }
            // 校验角色ID重复--做多一个弹窗的提示---end

            let roleIds = form.getFieldValue(name).replace(/,$/, '');
            roleIds = roleIds.split(',').map((role: string) => Number(role));

            if (roleIds) {
                try {
                    setValidateLoading(true);
                    const _data = await checkUserId(
                        {
                            boardId,
                        },
                        { ids: roleIds },
                        clubDeployVersion
                    );
                    const data = _data.sort((a, b) => a.id - b.id);
                    const unPassRoles = data?.filter(item => !item.isPass);
                    const passRoles = data?.filter(item => item.isPass);
                    if (!data || !unPassRoles || unPassRoles?.length > 0) {
                        errorMsgRef.current = '冰川通行证ID校验失败，请重新输入';
                    } else {
                        errorMsgRef.current = '';
                    }
                    form.validateFields([ name ]);
                    setAllValidatedRoles(data);

                    if (!unPassRoles || unPassRoles?.length) {
                        return;
                    }
                    data && setValidatedRoles(passRoles);
                    showTip && message.success('校验冰川通行证ID成功');
                    setRolesValidated(true);
                } catch (error) {
                    console.log('error :>> ', error);
                } finally {
                    setValidateLoading(false);
                }
            }

            form.validateFields([ name ]);
        },
        [ form, isPushAllFormName, name, boardId, clubDeployVersion, setValidatedRoles, setRolesValidated ]
    );

    useEffect(() => {
        shouldValidate && handleValidateRoles();
    }, [ handleValidateRoles, shouldValidate ]);

    useImperativeHandle(ref, () => {
        return {
            handleValidateRoles,
        };
    });

    // 清空收角色
    const handleRemoveReceiverId = useCallback(() => {
        // form.resetFields([ 'receiverId' ]);
        form.setFieldsValue({ [name]: '' });
        setAllValidatedRoles([]);
    }, [ form, name ]);

    // 收件人变更后需要重新校验
    function handleReceiverChange() {
        errorMsgRef.current = '';
        setRolesValidated(false);
    }

    return (
        <>
            <Form.Item noStyle shouldUpdate={(prev, next) => prev[isPushAllFormName] !== next[isPushAllFormName]}>
                {({ getFieldValue }) => {
                    return (
                        <Form.Item
                            name={name}
                            label={label}
                            required
                            validateFirst={true}
                            rules={[
                                {
                                    required: true,
                                    message: '指定冰川通行证ID不能为空，请添加用户！',
                                    transform: v => v && v.trim(),
                                },
                                {
                                    validator: rule => {
                                        if (receiverIdMsg) {
                                            message.warn(rule.message);
                                            setReceiverIdMsg('');
                                            return Promise.reject(rule.message);
                                        }
                                        return Promise.resolve();
                                    },
                                    message: receiverIdMsg,
                                },
                                {
                                    validator: (rule, value) => {
                                        let checkUnin: string[] = [];
                                        const _arr = value.split(',');
                                        _arr.forEach((x: string, xi: number) => {
                                            if (_arr.indexOf(x) !== xi) {
                                                checkUnin.push(x);
                                            }
                                        });
                                        checkUnin = Array.from(new Set(checkUnin));
                                        if (!rolesValidated && checkUnin.length) {
                                            return Promise.reject(`冰川通行证ID【${checkUnin.join(',')}】重复`);
                                        }
                                        return Promise.resolve();
                                    },
                                },
                                {
                                    validator: (_, value) => {
                                        if (!rolesValidated && !value) {
                                            return Promise.reject('提交前请校验推送范围');
                                        }
                                        if (!rolesValidated && value) {
                                            return Promise.reject(errorMsgRef.current || '请校验');
                                        }
                                        return Promise.resolve();
                                    },
                                    validateTrigger: [ 'onSubmit' ],
                                },
                            ]}
                            {...reset}
                        >
                            <Input.TextArea
                                rows={4}
                                style={{ width: '60%' }}
                                onChange={handleReceiverChange}
                                allowClear
                                placeholder={
                                    textAreaPlaceholder ??
                                    '输入冰川通行证ID，多个用户直接按用【英文逗号】分开！填写完成后点击【检测】进行校验！'
                                }
                            />
                        </Form.Item>
                    );
                }}
            </Form.Item>
            <Form.Item wrapperCol={{ offset: 3 }} shouldUpdate={(prev, next) => prev[name] !== next[name]}>
                <div style={{ width: '60%' }}>
                    <CheckRoleTable
                        data={allValidatedRoles as any}
                        checkedResultLoading={validateLoading}
                        isEdit={isEdit}
                    />
                </div>
            </Form.Item>
            <Form.Item wrapperCol={{ offset: 3 }}>
                <Space size="large">
                    <Button
                        type="primary"
                        onClick={() => handleValidateRoles()}
                        loading={validateLoading}
                        disabled={rolesValidated || validateLoading}
                    >
                        校验
                    </Button>
                    <Button type="primary" danger onClick={handleRemoveReceiverId}>
                        清空
                    </Button>
                </Space>
            </Form.Item>
        </>
    );
});

export default ActorCheckForm;
