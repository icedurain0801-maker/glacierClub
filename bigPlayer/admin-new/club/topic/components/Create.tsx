import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, Drawer, Form, Input, message, Tag } from 'antd';

import { addClubTopic, editClubTopic } from '@/api/club';
import UploadImg from '@/components/uploadFile/UploadImg';

import { BoardPermitOptionsType, BOARD_PERMIT_SEPARATE, CLUB_ENVIRONMENT_ENUM } from '@ts/club';
import { EditClubTopicDataType } from '@ts/clubTopic';

import { useClubUploadOption } from '../../board/hooks/useClubUploadOption';

interface ClubAppearanceCreateProps {
    clubBoardOptions: BoardPermitOptionsType[];
    clubDeployVersion: CLUB_ENVIRONMENT_ENUM;
    data: EditClubTopicDataType;
    visible: boolean;
    onOk(shouldChangeTab: boolean): void;
    onClose(): void;
    applicant: string;
}

export const NAME_MAX_LENGTH = 50;
/** 跳转链接最大长度 */
export const URL_MAX_LENGTH = 200;
export default function ClubAppearanceCreate(props: ClubAppearanceCreateProps) {
    const [ modalForm ] = Form.useForm();
    const { clubDeployVersion, data, visible, onClose, applicant, onOk } = props;
    const [ loading, setLoading ] = useState(false);
    const isCreate = useMemo(() => !data?.id, [ data ]);
    const ClubUploadOption = useClubUploadOption({ clubDeployVersion });
    useEffect(() => {
        if (visible && data) {
            modalForm.resetFields();
            modalForm.setFieldsValue(data);
        }
    }, [ data, isCreate, modalForm, visible ]);

    const handleSubmit = useCallback(async () => {
        try {
            setLoading(true);
            const { icon, ...rest } = await modalForm.validateFields();
            const boardId = isCreate ? data!.boardId.split(BOARD_PERMIT_SEPARATE)[1] : data!.boardId;
            const param = {
                ...data,
                boardId,
                applicant,
                icon: new URL(icon || '').pathname.slice(1),
                ...rest,
            };
            const { code, message: msg } = await (isCreate
                ? addClubTopic(param, clubDeployVersion)
                : editClubTopic(data.id, param, clubDeployVersion));
            setLoading(false);
            if (code === 0) {
                message.success(`${isCreate ? '新建' : '编辑'}成功`);
                onOk(isCreate);
            } else {
                message.error(msg);
            }
        } catch (err) {
            console.error('err', err);
            setLoading(false);
        }
    }, [ applicant, clubDeployVersion, data, isCreate, modalForm, onOk ]);

    return useMemo(
        () => (
            <Drawer
                width={700}
                title={(isCreate ? '新增' : '编辑') + '话题'}
                visible={visible}
                onClose={onClose}
                footer={[
                    <Button
                        style={{ float: 'right', marginRight: 16 }}
                        key="0"
                        type="primary"
                        loading={loading}
                        onClick={handleSubmit}
                    >
                        提交
                    </Button>,
                ]}
            >
                <Form form={modalForm} labelCol={{ span: 4 }}>
                    <Form.Item label="所属版块" wrapperCol={{ span: 10 }} required>
                        <Tag
                            color="cyan"
                            style={{
                                borderRadius: 8,
                                fontSize: 14,
                                padding: '4px 9px',
                            }}
                        >
                            {data?.boardName}
                        </Tag>
                    </Form.Item>

                    <Form.Item label="话题名称" name="name" required rules={[ { required: true, message: '不能为空' } ]}>
                        <Input style={{ width: 280 }} placeholder="输入话题名称" maxLength={50} />
                    </Form.Item>
                    <Form.Item
                        name="icon"
                        label="话题ICON"
                        extra="建议256*256,10M以内，支持png/jpg"
                        required
                        rules={[ { message: '话题ICON不可为空！', required: true } ]}
                    >
                        <UploadImg
                            imageOrigin=""
                            uploadOption={ClubUploadOption}
                            maxSize={10 * 1024 * 1024}
                            accept="image/png,image/jpg,image/jpeg"
                            isRandomFileName={true}
                        />
                    </Form.Item>
                    <Form.Item
                        label="话题导语"
                        name="introduction"
                        required
                        rules={[ { required: true, message: '不能为空' } ]}
                    >
                        <Input.TextArea placeholder="输入话题导语" maxLength={200} rows={4} />
                    </Form.Item>
                </Form>
            </Drawer>
        ),
        [ ClubUploadOption, data, handleSubmit, isCreate, loading, modalForm, onClose, visible ]
    );
}
