import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, Drawer, Form, FormInstance, Input, message, Modal, Radio, Select, Tabs, Tag } from 'antd';

import { addDressUp, editDressUp } from '@/api/club';
import UploadImg from '@/components/uploadFile/UploadImg';

import { BoardPermitOptionsType, BOARD_PERMIT_SEPARATE, CLUB_DEPLOY_VERSION } from '@ts/club';
import {
    DRESS_ENUM,
    DressUpInfos,
    DressUpTypeOptions,
    EditDressUpData,
    LISTING_STATUS,
    ListingStateOptions,
    ExpiredDatOptionsData,
    EXPIRED_DAY,
} from '@ts/appearance';

import { useClubUploadOption } from '../../board/hooks/useClubUploadOption';

interface ClubAppearanceCreateProps {
    clubBoardOptions: BoardPermitOptionsType[];
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    data: EditDressUpData;
    visible: boolean;
    onOk(): void;
    onClose(): void;
    applicant: string;
    languageOptions: Array<{
        label: string;
        value: string;
    }>;
    langMap: { [k in string]: string };
}

export const NAME_MAX_LENGTH = 50;
/** 跳转链接最大长度 */
export const URL_MAX_LENGTH = 200;
export default function ClubAppearanceCreate(props: ClubAppearanceCreateProps) {
    const [ modalForm ] = Form.useForm();
    const { clubDeployVersion, data, visible, onClose, applicant, languageOptions, langMap, onOk } = props;
    const [ loading, setLoading ] = useState(false);
    const isCreate = useMemo(() => !data?.id, [ data ]);
    const isHomeLand = useMemo(() => data?.boardId?.startsWith('zh'), [ data ]);
    const [ activeKey, setActiveKey ] = useState(isHomeLand ? 'zh-CN' : 'en-US');
    const ClubUploadOption = useClubUploadOption({ clubDeployVersion });
    useEffect(() => {
        if (visible && data) {
            modalForm.resetFields();
            modalForm.setFieldsValue(data);
            setActiveKey(isCreate ? (isHomeLand ? 'zh-CN' : 'en-US') : data.dressUpInfos[0].language);
        }
    }, [ data, isCreate, isHomeLand, modalForm, visible ]);

    const handleSubmit = useCallback(async () => {
        try {
            setLoading(true);
            const { iconUrl, ...rest } = await modalForm.validateFields();
            const boardId = data!.boardId.split(BOARD_PERMIT_SEPARATE)[1];
            const param = {
                boardId,
                applicant,
                iconUrl: new URL(iconUrl || '').pathname.slice(1),
                ...rest,
            };
            const { code, message: msg } = await (isCreate
                ? addDressUp(param, clubDeployVersion)
                : editDressUp(data.id, param, clubDeployVersion));
            setLoading(false);
            if (code === 0) {
                message.success(`${isCreate ? '新建' : '编辑'}成功`);
                onOk();
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
                title={(isCreate ? '新增' : '编辑') + '装扮'}
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
                <Form
                    form={modalForm}
                    labelCol={{ span: 4 }}
                    initialValues={{
                        dressUpInfos: [ { language: isHomeLand ? 'zh-CN' : 'en-US' } ],
                        dressType: DRESS_ENUM.Avatar,
                        listingState: LISTING_STATUS.Immediate,
                        expiredDay: EXPIRED_DAY.Forever,
                    }}
                >
                    <Form.List name="dressUpInfos">
                        {(fields, { add, remove }) => {
                            return (
                                <Tabs
                                    activeKey={activeKey}
                                    onTabClick={setActiveKey}
                                    {...(isHomeLand
                                        ? { type: 'card' }
                                        : { type: 'editable-card', addIcon: <div>+添加语种</div> })}
                                    onEdit={(key, action: 'add' | 'remove') => {
                                        const dressUpInfos: DressUpInfos[] = modalForm.getFieldValue('dressUpInfos');
                                        if (action === 'add') {
                                            const ref = React.createRef<{
                                                form: FormInstance;
                                            }>();
                                            const options = languageOptions.map(v => ({
                                                ...v,
                                                disabled: dressUpInfos.some(k => k.language === v.value),
                                            }));
                                            Modal.confirm({
                                                icon: null,
                                                content: <LangSelectModal options={options} ref={ref} />,
                                                async onOk() {
                                                    const { language } =
                                                        (await ref.current?.form.validateFields()) ?? {};
                                                    add({ language });
                                                },
                                            });
                                        } else {
                                            remove(dressUpInfos.findIndex(v => v.language === key));
                                        }
                                    }}
                                >
                                    {fields.map((field: { name: number }) => (
                                        <Tabs.TabPane
                                            forceRender
                                            closable={!!field.name}
                                            tab={
                                                langMap[
                                                    modalForm.getFieldValue([ 'dressUpInfos', field.name, 'language' ])
                                                ]
                                            }
                                            key={modalForm.getFieldValue([ 'dressUpInfos', field.name, 'language' ])}
                                        >
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

                                            <Form.Item
                                                label="装扮名称"
                                                name={[ field.name, 'dressName' ]}
                                                required
                                                rules={[ { required: true, message: '不能为空' } ]}
                                            >
                                                <Input
                                                    style={{ width: 280 }}
                                                    placeholder="输入装扮名称"
                                                    maxLength={100}
                                                />
                                            </Form.Item>
                                        </Tabs.TabPane>
                                    ))}
                                </Tabs>
                            );
                        }}
                    </Form.List>
                    <Form.Item label="装扮类型" name="dressType" required>
                        <Select style={{ width: 280 }} options={DressUpTypeOptions} disabled={!isCreate} />
                    </Form.Item>
                    <Form.Item
                        name="iconUrl"
                        label="装扮图片"
                        extra="建议140*140"
                        required
                        rules={[ { message: '装扮不可为空！', required: true } ]}
                    >
                        <UploadImg
                            imageOrigin=""
                            uploadOption={ClubUploadOption}
                            maxSize={2 * 1024 * 1024}
                            accept="image/png,image/jpg,image/jpeg,image/gif"
                            isRandomFileName={true}
                        />
                    </Form.Item>
                    <Form.Item label="上架方式" required name="listingState">
                        <Radio.Group disabled={!isCreate} style={{ width: 280 }} options={ListingStateOptions} />
                    </Form.Item>
                    <Form.Item label="有效期" required name="expiredDay">
                        <Radio.Group disabled={!isCreate} style={{ width: 280 }} options={ExpiredDatOptionsData} />
                    </Form.Item>
                </Form>
            </Drawer>
        ),
        [
            ClubUploadOption,
            activeKey,
            data,
            handleSubmit,
            isCreate,
            isHomeLand,
            langMap,
            languageOptions,
            loading,
            modalForm,
            onClose,
            visible,
        ]
    );
}
interface LangSelectModalProps {
    options: Array<{
        label: string;
        value: string;
    }>;
}
export const LangSelectModal = React.forwardRef((props: LangSelectModalProps, ref) => {
    const { options } = props;
    const [ form ] = Form.useForm();
    React.useImperativeHandle(ref, () => ({
        form,
    }));
    return (
        <Form form={form}>
            <Form.Item required rules={[ { required: true, message: '请选择' } ]} label="语种" name="language">
                <Select options={options} placeholder="请选择一个语种" />
            </Form.Item>
        </Form>
    );
});
