import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Drawer, DrawerProps, Form, Input, InputNumber, Radio, Space, Tag, message } from 'antd';

import { createTagSetting, updateTagSetting, validateTagNameExist, validateTagRangeExist } from '@/api/clubTag';
import { isEmpty } from '@/utils/helper';

import { BoardPermitOptionsType, CLUB_DEPLOY_VERSION } from '@ts/club';
import { TagChargeType, TagChargeTypeOptions, TagSettingItem, TagSettingListItem } from '@ts/clubTag';

type FormValues = {
    name: string;
    chargeType: TagChargeType;
    minCharge?: number;
    maxCharge?: number;
};

interface CreateProps extends DrawerProps {
    visible: boolean;
    data: TagSettingListItem | null;
    boardId: number | null;
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    onClose: () => void;
    onSuccess: () => void;
    clubBoardOptions: BoardPermitOptionsType[] | null;
}

const Create: React.FC<CreateProps> = ({
    visible,
    data,
    boardId,
    clubBoardOptions,
    clubDeployVersion,
    onClose,
    onSuccess,
    ...drawerProps
}) => {
    const [ form ] = Form.useForm<FormValues>();
    const [ submitting, setSubmitting ] = useState(false);

    console.log('boardId', boardId, clubBoardOptions);

    const isEdit = useMemo(() => !!data, [ data ]);

    useEffect(() => {
        if (!visible) {
            form.resetFields();
            return;
        }
        if (isEdit && data) {
            form.setFieldsValue({
                name: data.name,
                chargeType: data.chargeType as TagChargeType,
                minCharge: data.minCharge,
                maxCharge: data.maxCharge === -1 ? undefined : data.maxCharge,
            });
        } else {
            form.setFieldsValue({
                chargeType: TagChargeType.Unlimited,
                minCharge: 0,
                maxCharge: undefined,
            });
        }
    }, [ data, form, isEdit, visible ]);

    const handleClose = useCallback(() => {
        form.resetFields();
        onClose();
    }, [ form, onClose ]);

    const validateName = useCallback(
        async (_: unknown, value: string) => {
            if (!value) {
                return Promise.resolve();
            }
            if (boardId == null) {
                return Promise.reject('请选择版块');
            }
            const { code, data: existData } = await validateTagNameExist(
                {
                    boardId,
                    name: value,
                    ...(isEdit ? { id: data!.id } : {}),
                },
                clubDeployVersion
            );
            if (code === 0) {
                const isExist = Array.isArray(existData) ? existData[0] : existData;
                if (isExist) {
                    return Promise.reject('标签名称已存在');
                }
            }
            return Promise.resolve();
        },
        [ boardId, clubDeployVersion, data, isEdit ]
    );

    const validateMinCharge = useCallback(
        async (_, value: number | undefined) => {
            if (value == null || value === undefined) {
                return Promise.reject('请输入最小充值金额');
            }
            const maxCharge = form.getFieldValue('maxCharge');
            if (maxCharge !== undefined && maxCharge !== -1 && value > maxCharge) {
                return Promise.reject('最小充值金额需小于等于最大充值金额');
            }
            if (!isEmpty(value) && !isEmpty(maxCharge)) {
                const ret = await validateTagRangeExist(
                    {
                        boardId: boardId!,
                        minCharge: value,
                        maxCharge: maxCharge === -1 ? undefined : maxCharge,
                        ...(isEdit ? { id: data!.id } : {}),
                    },
                    clubDeployVersion
                );
                if (ret.code !== 0) {
                    return Promise.reject(ret.msg || '当前充值金额范围已存在，需重新设置');
                }
            }
            return Promise.resolve();
        },
        [ boardId, clubDeployVersion, data, form, isEdit ]
    );

    const boardName = useMemo(() => {
        return (clubBoardOptions ?? []).find(v => v.value === clubDeployVersion)?.children.find(v => v.id === boardId)
            ?.label;
    }, [ boardId, clubBoardOptions, clubDeployVersion ]);

    const handleSubmit = useCallback(async () => {
        if (boardId == null) {
            message.warning('请选择版块');
            return;
        }
        const values = await form.validateFields();
        const { chargeType, name } = values;
        let minCharge = chargeType === TagChargeType.Unlimited ? 0 : values.minCharge ?? 0;
        let maxCharge =
            chargeType === TagChargeType.Unlimited
                ? -1
                : values.maxCharge == null || values.maxCharge === undefined
                ? -1
                : values.maxCharge;

        if (chargeType !== TagChargeType.Unlimited && maxCharge !== -1 && maxCharge < minCharge) {
            message.error('最大充值金额需大于等于最小充值金额');
            return;
        }

        setSubmitting(true);
        try {
            const payload: TagSettingItem = {
                name,
                chargeType,
                minCharge,
                maxCharge,
            };

            if (!isEdit) {
                const { code, msg } = await createTagSetting({ boardId }, payload, clubDeployVersion);
                if (code === 0) {
                    message.success('新增成功');
                    onSuccess();
                    handleClose();
                } else {
                    message.error(msg || '新增失败');
                }
            } else {
                const { code, msg } = await updateTagSetting(
                    { boardId },
                    {
                        ...payload,
                        id: data!.id,
                    },
                    clubDeployVersion
                );
                if (code === 0) {
                    message.success('编辑成功');
                    onSuccess();
                    handleClose();
                } else {
                    message.error(msg || '编辑失败');
                }
            }
        } finally {
            setSubmitting(false);
        }
    }, [ boardId, clubDeployVersion, data, form, handleClose, isEdit, onSuccess ]);

    return (
        <Drawer
            visible={visible}
            width={520}
            title={isEdit ? '编辑标签' : '新增标签'}
            footer={
                <div style={{ textAlign: 'right' }}>
                    <Space>
                        <Button onClick={handleClose}>取消</Button>
                        <Button type="primary" loading={submitting} onClick={handleSubmit}>
                            确定
                        </Button>
                    </Space>
                </div>
            }
            onClose={handleClose}
            destroyOnClose
            {...drawerProps}
        >
            <Form form={form} labelCol={{ span: 6 }}>
                <Form.Item label="所属版块" wrapperCol={{ span: 6 }} required>
                    <Tag
                        color="cyan"
                        style={{
                            borderRadius: 8,
                            fontSize: 14,
                            padding: '4px 9px',
                        }}
                    >
                        {boardName}
                    </Tag>
                </Form.Item>
                <Form.Item
                    label="标签名称"
                    name="name"
                    rules={[
                        { required: true, message: '请输入标签名称' },
                        { validator: validateName, validateTrigger: 'onBlur' },
                    ]}
                >
                    <Input className="q1-form-item-xl" placeholder="请输入标签名称" maxLength={30} />
                </Form.Item>
                <Form.Item label="充值金额" name="chargeType" rules={[ { required: true, message: '请选择充值条件' } ]}>
                    <Radio.Group optionType="button" options={TagChargeTypeOptions} />
                </Form.Item>
                <Form.Item
                    shouldUpdate={(prev, next) => prev.chargeType !== next.chargeType}
                    wrapperCol={{ offset: 6 }}
                >
                    {({ getFieldValue }) =>
                        getFieldValue('chargeType') !== TagChargeType.Unlimited ? (
                            <>
                                <Space>
                                    <Form.Item shouldUpdate={(prev, next) => prev.maxCharge !== next.maxCharge} noStyle>
                                        <Form.Item
                                            name="minCharge"
                                            rules={[
                                                { required: true, message: '请输入最小充值金额' },
                                                { validator: validateMinCharge },
                                            ]}
                                            noStyle
                                            extra="注：最大值填-1为不限"
                                        >
                                            <InputNumber min={0} precision={0} />
                                        </Form.Item>
                                    </Form.Item>

                                    <span>{'<=账号累计充值额<='}</span>
                                    <Form.Item noStyle name="maxCharge">
                                        <InputNumber min={-1} precision={0} />
                                    </Form.Item>
                                </Space>
                                <Form.Item label={<></>} colon={false}>
                                    注：最大值填-1为不限
                                </Form.Item>
                            </>
                        ) : null
                    }
                </Form.Item>
            </Form>
        </Drawer>
    );
};

export default Create;
