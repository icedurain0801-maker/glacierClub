import { Button, Card, DatePicker, Form, FormInstance, Input, Modal, Radio, Select, Spin, message } from 'antd';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { inject, observer, useObserver } from 'mobx-react';
import moment, { Moment } from 'moment';
import { LinkOutlined } from '@ant-design/icons';
import { usePersistantFunction } from '@q1/hooks';

import { DividerTitle } from '@/pages/email/common/create';
import { useContentParams, useContentTab, useLiveContentTabSearch, useStore } from '@/context';
import { createPushMessage, getPushMessageList, updatePushMessage } from '@/api/club';
import { StoreType } from '@/store/config';
import UploadImg from '@/components/uploadFile/UploadImg';
import RichtextEditor, { RichtextEditRefProps } from '@/components/richtextEditor/RichtextEditor';
import { disabledRangeTime2, formatToUtc, html2Text } from '@/utils/helper';
import { getPathName } from '@/utils/lib';
import { getImageSize } from '@/utils/file/image';

import {
    BOARD_PERMIT_SEPARATE,
    MAX_PUSH_CONTENT,
    MAX_PUSH_TITLE,
    PUSH_RANGE_ENUM,
    PushRangeOptions,
    SenderList,
    CLUB_DEPLOY_VERSION,
} from '@ts/club';

import { usePremitClubBoard } from '../../board/hooks/useClubBoardOptions';
import UserCheckForm from './components/UserCheckForm';
import { useClubUploadOption } from '../../board/hooks/useClubUploadOption';

import { TABLE_TYPE } from '.';

const labelCol = { span: 3 };

interface CreatePushMessageProps {}

interface CreatePushMessagePropsMobx extends CreatePushMessageProps, Pick<StoreType, 'UIState'> {}

function CreatePushMessage(props: CreatePushMessageProps) {
    const { UIState } = props as CreatePushMessagePropsMobx;

    const [ initialValues, setInitialValues ] = useState<any>({
        isPushAll: PUSH_RANGE_ENUM.All,
        senderList: [],
        content: {
            text: '',
            html: '',
        },
    });
    const [ form ] = Form.useForm();

    const { Club } = useStore();
    const isLoaded = useObserver(() => Club.isLoaded);
    const [ loading, setLoading ] = useState(false);

    const { clubBoardOptions } = usePremitClubBoard();
    const searchParams = useLiveContentTabSearch();
    const _boardId = searchParams.get('boardId')
        ? decodeURIComponent(searchParams.get('boardId') as string)
        : 'zh&&1';
    const [ clubDeployVersion ] = useState<CLUB_DEPLOY_VERSION>(
        (searchParams.get('clubDeployVersion') || 'zh') as CLUB_DEPLOY_VERSION
    );

    const { editId, copyId } = useContentParams();
    const editorRef = useRef<null | RichtextEditRefProps>(null);
    const [ modal, contextHolder ] = Modal.useModal();
    const boardId = useMemo(() => {
        return _boardId.split(BOARD_PERMIT_SEPARATE)[1] as string;
    }, [ _boardId ]);

    const isEdit = useMemo(() => {
        return !!editId;
    }, [ editId ]);

    const isCopy = useMemo(() => {
        return !!copyId;
    }, [ copyId ]);

    let ClubUploadOption = useClubUploadOption({ clubDeployVersion });
    const tab = useContentTab();

    const getDetail = useCallback(
        async (detailId: number) => {
            setLoading(true);
            try {
                const { code, data = [] } = await getPushMessageList(
                    {
                        id: Number(detailId),
                        boardId: Number(boardId),
                    },
                    clubDeployVersion
                );
                if (code === 0 && data) {
                    const detailData = data[0];
                    const { isPushAll, image, title, content, pushTime, sender, senderList, auditedTime } = detailData;
                    let pushUser = sender && JSON.parse(sender).join(',');
                    const initValue = {
                        boardId: _boardId,
                        isPushAll,
                        title,
                        content: {
                            text: html2Text(content),
                            html: content,
                        },
                        ...(isPushAll === PUSH_RANGE_ENUM.PART
                            ? {
                                  pushUser,
                              }
                            : {}),
                        pushTime: pushTime ? moment(pushTime) : auditedTime ? moment(auditedTime) : undefined,
                        image,
                    };
                    setInitialValues({ ...initValue, senderList });
                    setValidatedRoles(senderList);
                    form.setFieldsValue(initValue);
                }
            } finally {
                setLoading(false);
            }
        },
        [ _boardId, boardId, clubDeployVersion, form ]
    );

    useEffect(() => {
        form.setFields([
            {
                name: 'boardId',
                value: _boardId,
            },
        ]);
    }, [ _boardId, boardId, form ]);

    useEffect(() => {
        if (isEdit || isCopy) {
            const detailId = editId || copyId;
            getDetail(Number(detailId));
        }
    }, [ clubDeployVersion, copyId, editId, getDetail, isCopy, isEdit ]);

    const [ submitLoading, setSubmitLoading ] = useState(false);

    // 校验state
    const [ rolesValidated, setRolesValidated ] = useState(true);
    const [ validatedRoles, setValidatedRoles ] = useState<SenderList[]>(initialValues ? initialValues.senderList : []); // 通过效验的合规角色

    const actorCheckRef = useRef<null | {
        handleValidateRoles: (showTip: boolean) => void;
    }>(null);

    const handleSubmit = useCallback(async () => {
        setSubmitLoading(true);
        try {
            const values = await form.validateFields();
            const { content, boardId, image, pushTime, isPushAll, ...reset } = values;
            const pushUser = validatedRoles.map(item => item.id);
            let style = '';
            if (image) {
                const imageSize = await getImageSize(image);
                style = JSON.stringify(imageSize);
            }
            let params = {
                ...reset,
                ...(image
                    ? {
                          image: getPathName(image),
                          style,
                      }
                    : {}),
                content: content.html,
                boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1],
                pushTime: formatToUtc(pushTime),
                isPushAll,
                pushUser: isPushAll === PUSH_RANGE_ENUM.All ? '' : JSON.stringify(pushUser),
            };
            if (!isEdit) {
                const { code, msg } = await createPushMessage(params, clubDeployVersion);
                if (code === 0) {
                    message.success(isCopy ? '复制成功' : '新增成功');
                    UIState.gotoTab({
                        pathname: `/game/club/push/list`,
                        search: `?tableType=${TABLE_TYPE.Audit}`,
                    });
                    UIState.closeTab(tab);
                    setTimeout(() => {
                        form.resetFields();
                    }, 100);
                } else {
                    message.error(msg || '操作失败');
                }
            } else {
                const { code, msg } = await updatePushMessage(
                    {
                        ...params,
                        id: Number(editId),
                    },
                    clubDeployVersion
                );
                if (code === 0) {
                    message.success('编辑成功');
                    UIState.gotoTab({
                        pathname: `/game/club/push/list`,
                        search: `?tableType=${TABLE_TYPE.Audit}`,
                    });
                    UIState.closeTab(tab);
                    setTimeout(() => {
                        form.resetFields();
                    }, 100);
                } else {
                    message.error(msg || '操作失败');
                }
            }
        } catch (error) {
            console.log('error', error);
        } finally {
            setSubmitLoading(false);
        }
    }, [ UIState, clubDeployVersion, editId, form, isCopy, isEdit, tab, validatedRoles ]);
    const { handleOpenLinkModal } = usePersistantFunction({
        handleOpenLinkModal() {
            const ref = React.createRef<{ form: FormInstance }>();
            modal.confirm({
                icon: null,
                width: 480,
                centered: true,
                closable: false,
                content: <LinkEditForm ref={ref} />,
                async onOk() {
                    const values = await ref.current?.form.validateFields();
                    const { title, href } = values;
                    const formatHref = href.trim();
                    editorRef.current?.handleInsertLink({
                        title: title || formatHref,
                        href: formatHref,
                    });
                },
            });
        },
    });
    return (
        <Spin spinning={!isLoaded || loading}>
            <Card
                actions={[
                    <Button
                        style={{ float: 'right', marginRight: 16 }}
                        key="0"
                        type="primary"
                        loading={submitLoading}
                        onClick={() => handleSubmit()}
                    >
                        提交
                    </Button>,
                ]}
            >
                {DividerTitle(isEdit ? '编辑消息' : isCopy ? '复制消息' : '新增消息')}
                <Form form={form} labelCol={labelCol} scrollToFirstError={true} initialValues={initialValues}>
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
                    <Form.Item name="isPushAll" label="推送范围" required>
                        <Radio.Group>
                            {PushRangeOptions.map(item => {
                                return (
                                    <Radio.Button key={item.value} value={item.value}>
                                        {item.label}
                                    </Radio.Button>
                                );
                            })}
                        </Radio.Group>
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(pre, cur) => pre.isPushAll !== cur.isPushAll}>
                        {({ getFieldValue }) => {
                            const isPushAll = getFieldValue('isPushAll');
                            return isPushAll === PUSH_RANGE_ENUM.PART ? (
                                <UserCheckForm
                                    boardId={boardId}
                                    clubDeployVersion={clubDeployVersion}
                                    form={form}
                                    validUser={initialValues?.senderList}
                                    setValidatedRoles={setValidatedRoles}
                                    isEdit={isEdit}
                                    name="pushUser"
                                    isPushAllFormName="isPushAll"
                                    label="冰川通行证ID"
                                    required
                                    validateFirst={true}
                                    rolesValidated={rolesValidated}
                                    setRolesValidated={setRolesValidated}
                                    ref={actorCheckRef}
                                />
                            ) : null;
                        }}
                    </Form.Item>
                    <Form.Item
                        name="title"
                        label="标题"
                        normalize={val => val?.replace(/[, ]/g, '')}
                        rules={[
                            {
                                required: true,
                                message: '标题不能为空，请输入！',
                                // transform: v => v.trim()
                            },
                        ]}
                        // validateTrigger="onBlur"
                    >
                        <Input className="input-width" maxLength={MAX_PUSH_TITLE} placeholder="请输入标题" />
                    </Form.Item>
                    <Form.Item
                        name="content"
                        label="内容"
                        validateFirst
                        rules={[
                            {
                                required: true,
                                message: '内容不能为空，请输入！',
                                transform: v => v?.text.trim(),
                            },
                            {
                                validator: (rule, { text }) => {
                                    if (text?.replace(/[\n\r]/g, '')?.length > MAX_PUSH_CONTENT) {
                                        message.warning(rule.message);
                                        return Promise.reject(rule.message);
                                    }
                                    return Promise.resolve();
                                },
                                validateTrigger: [ 'onBlur' ],
                                message: `内容字数不能超出${MAX_PUSH_CONTENT}个汉字，请修改！`,
                            },
                        ]}
                        validateTrigger={[ 'onChange' ]}
                    >
                        <RichtextEditor
                            // maxTextLength={MAX_PUSH_CONTENT}
                            ref={editorRef}
                            extendControls={[
                                'separator',
                                {
                                    key: 'customForm',
                                    type: 'button',
                                    title: '超链接',
                                    onClick: handleOpenLinkModal,
                                    text: <LinkOutlined style={{ fontSize: 18 }} />,
                                },
                            ]}
                            placeholder={`内容字数不能超出${MAX_PUSH_CONTENT}个汉字`}
                            fontSizes={[ 12, 14, 16, 18, 20, 24, 28, 30, 32 ]}
                        />
                    </Form.Item>
                    <Form.Item
                        name="pushTime"
                        label="推送时间"
                        rules={[
                            {
                                validator: (rule, value: Moment) => {
                                    if (!value) {
                                        return Promise.resolve();
                                    }
                                    if (value && value.isBefore(moment())) {
                                        return Promise.reject('推送时间需大于当前北京时间');
                                    }
                                    return Promise.resolve();
                                },
                            },
                        ]}
                        validateTrigger="onBlur"
                    >
                        <DatePicker
                            disabledDate={date => {
                                return date.isBefore(moment(), 'date');
                            }}
                            format="YYYY-MM-DD HH:mm:ss"
                            showTime={{ hideDisabledOptions: true }}
                            disabledTime={date => disabledRangeTime2(date)}
                        />
                    </Form.Item>
                    <Form.Item name="image" label="上传图片" extra="360*120，只能上传jpg/png文件，且不超过10MB">
                        <UploadImg
                            maxCount={1}
                            imageOrigin=""
                            uploadOption={ClubUploadOption}
                            maxSize={10 * 1024 * 1024}
                            accept="image/png,image/jpeg"
                            isRandomFileName={true}
                        />
                    </Form.Item>
                </Form>
                {contextHolder}
            </Card>
        </Spin>
    );
}

const CreatePushMessageFn = inject('UIState', 'Club')(observer(CreatePushMessage));

// 高阶组件，boardList有值才渲染
export default function CreatePushMessagePage() {
    const { Club } = useStore();
    const isLoaded = useObserver(() => Club.isLoaded);
    return isLoaded ? (
        <CreatePushMessageFn />
    ) : (
        <Spin size="large">
            <div style={{ height: '100vh' }}></div>
        </Spin>
    );
}

const LinkEditForm = React.forwardRef((_, ref) => {
    const [ form ] = Form.useForm();
    React.useImperativeHandle(ref, () => ({
        form,
    }));
    return (
        <Form form={form} labelCol={{ span: 3 }}>
            <Form.Item label="标题" name="title">
                <Input placeholder="输入内容描述" maxLength={50} />
            </Form.Item>
            <Form.Item label="地址" name="href" rules={[ { required: true, message: '地址不能为空' } ]}>
                <Input placeholder="添加网页链接" />
            </Form.Item>
        </Form>
    );
});
