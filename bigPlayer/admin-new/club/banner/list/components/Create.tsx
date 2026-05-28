import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, DatePicker, Drawer, Form, Input, message, Select } from 'antd';
import moment, { Moment } from 'moment';
import { inject, observer } from 'mobx-react';

import { addBanner, editBanner, getSectionByBoard } from '@/api/club';
import { useContentDialogContainer } from '@/context';
import UploadImg from '@/components/uploadFile/UploadImg';
import { StoreType } from '@/store/config';
import { useClubUploadOption } from '@/pages/club/board/hooks/useClubUploadOption';

import {
    BannerListResponse,
    BoardPermitOptionsType,
    BOARD_PERMIT_SEPARATE,
    CLUB_DEPLOY_VERSION,
    MOMENT_TYPE,
    NormalOptionsType,
} from '@ts/club';

import { sectionIdDefault } from './TableList';

interface CreateProps {
    clubBoardOptions: BoardPermitOptionsType[];
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    data?: BannerListResponse;
    visible: boolean;
    onOk?: (data: { boardId: string }) => void;
    onCancel?: () => void;
}

interface CreatePropsMobx extends CreateProps, Pick<StoreType, 'User'> {}

export const NAME_MAX_LENGTH = 50;
/** 跳转链接最大长度 */
export const URL_MAX_LENGTH = 200;

export const POSTION_SEPARATOR = ',';

function formatS2C(data: BannerListResponse) {
    const { startTime, endTime, positions, ...ret } = data;
    return {
        ...ret,
        startTime: startTime ? moment(startTime) : startTime,
        endTime: endTime ? moment(endTime) : endTime,
        ...(positions ? { positions: (positions ?? '').split(POSTION_SEPARATOR).map(Number) } : {}),
    };
}

function Create(props: CreateProps) {
    const [ modalForm ] = Form.useForm();
    const {
        clubDeployVersion,
        clubBoardOptions,
        data,
        visible,
        onOk,
        onCancel,
        User: { name: userName },
    } = props as CreatePropsMobx;

    const isCreate = useMemo(() => !data?.id, [ data ]);

    const initVal = useMemo(() => {
        return data ? formatS2C(data) : undefined;
    }, [ data ]);

    const [ sectionIdOptions, setsectionIdOptions ] = useState<NormalOptionsType[]>(sectionIdDefault);

    // 获取栏目
    const fetchSectionList = useCallback(
        async boardId => {
            const { data } = await getSectionByBoard(
                { boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1] },
                clubDeployVersion
            );
            setsectionIdOptions([
                ...sectionIdDefault,
                ...(data || [])
                    .filter(x => x.parentId === 0 && x.type !== MOMENT_TYPE.Feeling) // 不展示子集与动态
                    .map(x => ({
                        label: x.name,
                        value: x.id,
                        disabled: x?.status === 0, // 不启用的不可点击
                    })),
            ]);
        },
        [ clubDeployVersion ]
    );
    useEffect(() => {
        if (data?.boardId) {
            fetchSectionList(data.boardId);
        }
    }, [ data, fetchSectionList ]);

    let ClubUploadOption = useClubUploadOption({ clubDeployVersion });
    const [ loading, setLoading ] = useState(false);

    useEffect(() => {
        if (visible && data) {
            modalForm.resetFields();
            console.log('data===>', formatS2C(data));
            modalForm.setFieldsValue(formatS2C(data));
        }
    }, [ data, modalForm, visible ]);

    const handleSubmit = useCallback(async () => {
        try {
            setLoading(true);
            const { boardId, name, image, positions, ...ret } = await modalForm.validateFields();
            let query = { boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1] };
            let param: any = {
                ...ret,
                name: name?.trim(),
                image: new URL(image || '').pathname.slice(1),
                creator: userName,
                positions: positions.join(POSTION_SEPARATOR),
            };
            const { code, msg } = await (isCreate
                ? addBanner(query, param, clubDeployVersion)
                : editBanner(
                      query,
                      {
                          id: data?.id,
                          ...param,
                      },
                      clubDeployVersion
                  ));
            setLoading(false);
            if (code === 0) {
                onOk?.(query);
                message.success(`${isCreate ? '新建' : '编辑'}成功！`);
            } else {
                message.error(msg);
            }
        } catch (err) {
            console.log('err', err);
            setLoading(false);
        }
    }, [ data, clubDeployVersion, isCreate, modalForm, onOk, userName ]);

    const handleReset = useCallback(() => {
        modalForm.resetFields();
    }, [ modalForm ]);

    const handleChange = useCallback(
        val => {
            if (val.hasOwnProperty('startTime')) {
                modalForm.validateFields([ 'endTime' ]);
            }
        },
        [ modalForm ]
    );

    return (
        <Drawer
            getContainer={useContentDialogContainer()}
            width={900}
            title={`${isCreate ? '新增' : '编辑'}轮播图`}
            visible={visible}
            onClose={() => {
                onCancel?.();
            }}
            footer={[
                <Button
                    style={{ float: 'right', marginRight: 16 }}
                    key="0"
                    type="primary"
                    loading={loading}
                    onClick={() => handleSubmit()}
                >
                    提交
                </Button>,
                <Button style={{ float: 'right', marginRight: 16 }} key="1" onClick={() => handleReset()}>
                    重置
                </Button>,
            ]}
        >
            <Form form={modalForm} initialValues={initVal} labelCol={{ span: 3 }} onValuesChange={handleChange}>
                <Form.Item name="boardId" label="所属版块" wrapperCol={{ span: 10 }} required>
                    <Select disabled>
                        {clubBoardOptions?.map(item =>
                            item?.children?.length ? (
                                <Select.OptGroup label={item.label} key={item.value}>
                                    {item.children.map(childItem => (
                                        <Select.Option value={childItem.value} key={childItem.value}>
                                            {childItem.label}
                                        </Select.Option>
                                    ))}
                                </Select.OptGroup>
                            ) : null
                        )}
                    </Select>
                </Form.Item>
                <Form.Item
                    name="name"
                    label="名称"
                    rules={[ { message: '请输入', required: true } ]}
                    wrapperCol={{ span: 10 }}
                >
                    <Input maxLength={NAME_MAX_LENGTH} placeholder="请输入" />
                </Form.Item>
                <Form.Item
                    name="positions"
                    label="位置"
                    rules={[ { message: '请选择', required: true } ]}
                    wrapperCol={{ span: 10 }}
                >
                    <Select options={sectionIdOptions} mode="multiple" placeholder="请选择" disabled={!isCreate} />
                </Form.Item>
                <Form.Item
                    name="image"
                    label="上传图片"
                    extra="尺寸建议750*200，png/jpg格式，内存2M以内"
                    rules={[ { message: '请选择', required: true } ]}
                >
                    <UploadImg
                        imageOrigin=""
                        uploadOption={ClubUploadOption}
                        maxSize={2 * 1024 * 1024}
                        accept="image/png,image/jpeg"
                        isRandomFileName={true}
                    />
                </Form.Item>
                <Form.Item
                    name="redirection"
                    label="跳转链接"
                    normalize={val => val?.trim()}
                    rules={[ { message: '请输入', required: true } ]}
                >
                    <Input.TextArea rows={2} placeholder="请输入" maxLength={URL_MAX_LENGTH} />
                </Form.Item>
                <Form.Item name="startTime" label="开始时间">
                    <DatePicker showTime />
                </Form.Item>
                <Form.Item
                    name="endTime"
                    label="结束时间"
                    rules={[
                        {
                            validator: async (_, val: Moment) => {
                                const _startTime = modalForm.getFieldValue('startTime') as Moment;
                                if (val && _startTime && _startTime.isAfter(val)) {
                                    return Promise.reject('结束时间需大于开始时间');
                                }
                                return Promise.resolve();
                            },
                        },
                    ]}
                >
                    <DatePicker showTime />
                </Form.Item>
            </Form>
        </Drawer>
    );
}
export default inject('User')(observer(Create));
