import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, Drawer, Form, Input, message, Select } from 'antd';
import { CloudUploadOutlined } from '@ant-design/icons';

import { createEmoticon, updateEmoticon } from '@/api/club';
import { useContentDialogContainer } from '@/context';
import UploadImg from '@/components/uploadFile/UploadImg';
import { StoreType } from '@/store/config';
import { useClubUploadOption } from '@/pages/club/board/hooks/useClubUploadOption';
import UploadMultipleImg from '@/components/uploadFile/UploadMultipleImg';

import {
    EmoticonItem,
    BoardPermitOptionsType,
    BOARD_PERMIT_SEPARATE,
    CreateEmoticonParams,
    CLUB_DEPLOY_VERSION,
} from '@ts/club';

require('./create.less');

interface CreateProps {
    clubBoardOptions: BoardPermitOptionsType[];
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    data?: EmoticonItem;
    visible: boolean;
    onOk?: (data: { boardId: string }) => void;
    onCancel?: () => void;
}

interface CreatePropsMobx extends CreateProps, Pick<StoreType, 'User'> {}

export const IMAGE_LENGTH_MAX = 20;
export const NAME_MAX_LENGTH = 50;

function Create(props: CreateProps) {
    const [ modalForm ] = Form.useForm();
    const { clubDeployVersion, clubBoardOptions, data, visible, onOk, onCancel } = props as CreatePropsMobx;

    const isCreate = useMemo(() => !data?.id, [ data ]);

    const initVal = useMemo(() => {
        if (data) {
            const { list, ...reset } = data;
            const initValue = {
                ...reset,
                list: list ? JSON.parse(list) : [],
            };
            return initValue;
        } else {
            return {};
        }
    }, [ data ]);

    let ClubUploadOption = useClubUploadOption({ clubDeployVersion });
    const [ loading, setLoading ] = useState(false);

    useEffect(() => {
        if (visible && data) {
            modalForm.resetFields();
            const { list, ...reset } = data;
            const initValue = {
                ...reset,
                list: list ? JSON.parse(list) : [],
            };
            console.log('initValue', initValue);
            modalForm.setFieldsValue(initValue);
        }
    }, [ data, modalForm, visible ]);

    const handleSubmit = useCallback(async () => {
        try {
            setLoading(true);
            const { boardId: _boardId, name, icon, list } = await modalForm.validateFields();
            const boardId = _boardId.split(BOARD_PERMIT_SEPARATE)[1];
            const _list = list.map((url: string) => new URL(url || '').pathname.slice(1));
            let param: CreateEmoticonParams = {
                boardId,
                name: name?.trim(),
                icon: new URL(icon || '').pathname.slice(1),
                list: JSON.stringify(_list),
            };
            const { code, msg } = await (isCreate
                ? createEmoticon(param, clubDeployVersion)
                : updateEmoticon(
                      {
                          id: data?.id as number,
                          ...param,
                      },
                      clubDeployVersion
                  ));
            if (code === 0) {
                onOk?.({ boardId });
                message.success(`${isCreate ? '新建' : '编辑'}成功！`);
            } else {
                message.error(msg);
            }
        } catch (err) {
            console.log('err', err);
        } finally {
            setLoading(false);
        }
    }, [ data, clubDeployVersion, isCreate, modalForm, onOk ]);

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
            className="emoticons-crate-drawer"
            getContainer={useContentDialogContainer()}
            width={900}
            title={`${isCreate ? '新增' : '编辑'}表情包`}
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
                    name="icon"
                    label="表情包ICON"
                    extra="尺寸建议64*64，png/jpg格式，内存2M以内"
                    rules={[ { message: 'ICON不可为空！', required: true } ]}
                >
                    <UploadImg
                        imageOrigin=""
                        uploadOption={ClubUploadOption}
                        maxSize={2 * 1024 * 1024}
                        accept="image/png,image/jpg,image/jpeg,image/gif"
                        isRandomFileName={true}
                    />
                </Form.Item>
                <Form.Item name="list" label="表情包" rules={[ { message: '表情包不可为空！', required: true } ]}>
                    <UploadMultipleImg
                        uploadButton={
                            <div className="upload-btn">
                                <CloudUploadOutlined className="upload-icon" />
                                <p className="upload-text">点击或将文件拖拽到这里上传</p>
                                <p className="upload-hint">
                                    支持主流图片格式与GIF图，建议64*64，长按左上角可拖动可排序
                                </p>
                            </div>
                        }
                        isShowImageLength={false}
                        uploadOption={ClubUploadOption}
                        listType="picture"
                        accept="image/png,image/jpg,image/jpeg,image/gif"
                        maxSize={2 * 1024 * 1024}
                        maxCount={IMAGE_LENGTH_MAX}
                        isRandomFileName={true}
                        multiple={true}
                        isCompressedImage={true}
                    />
                </Form.Item>
            </Form>
        </Drawer>
    );
}
export default Create;
