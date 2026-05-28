import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Form, InputNumber, message, Modal, Radio, Select, Space } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

import { postRecommend, postToTop, setPostWeight } from '@/api/club';
import { useContentDialogContainer } from '@/context';
import { isEmpty } from '@/utils/helper';

import {
    CLUB_DEPLOY_VERSION,
    DateTypeOptionsData,
    TopDateValueOptionsData,
    DATE_TYPE,
    DATE_VALUE,
    PostListItem,
    TopHomeRecommend,
} from '@ts/club';
import { EnabledOptions, IS_ENABLE } from '@ts/enum/enum';

function normalRules(message = '请选择', required = true) {
    return [ { message, required } ];
}

/** 判断是首页推荐还是置顶 */
export enum TOP_HOME_RECOMMEND {
    Top = 1, // 置顶
    Recommend = 2, // 推荐
}

/** 帖子置顶 */
interface PostToTopProps {
    type: TOP_HOME_RECOMMEND;
    data?: PostListItem;
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    visible: boolean;
    onOk?: () => void;
    onCancel?: () => void;
    isEdit?: boolean;
}
const initialValues = {
    topHomeRecommend: TopHomeRecommend.Recommend,
    isActivityTop: IS_ENABLE.Unable,
    dateValue: DATE_VALUE.Day1,
    dateType: DATE_TYPE.Day,
    weight: 1,
};

// 构造一个options 1-10
const WeightOptions = Array.from({ length: 10 }, (_, i) => ({
    label: i + 1,
    value: i + 1,
}));

function PostToTopFn(props: PostToTopProps) {
    const [ modalForm ] = Form.useForm();
    const { type, data, clubDeployVersion, visible, isEdit, onOk, onCancel } = props;

    const [ currentDateType, setCurrentDateType ] = useState<DATE_VALUE>(DATE_VALUE.Day1);

    const onValuesChange = useCallback(
        async val => {
            if ('dateValue' in val) {
                let value = val.dateValue;
                let dateType = DATE_TYPE.Day;
                if (value === DATE_VALUE.Custom) {
                    dateType = DATE_TYPE.Custom;
                }
                if (value === DATE_VALUE.Forever) {
                    dateType = DATE_TYPE.Forever;
                }
                modalForm.setFields([
                    {
                        name: 'dateType',
                        value: dateType,
                    },
                ]);
            }
        },
        [ modalForm ]
    );

    useEffect(() => {
        if (isEdit && visible && type === TOP_HOME_RECOMMEND.Recommend) {
            modalForm.setFieldsValue({
                weight: isEmpty(data?.topHomeRecommendWeight) ? undefined : data?.topHomeRecommendWeight,
            });
        }
    }, [ isEdit, data, modalForm, visible, type ]);

    const title = useMemo(() => {
        return type === TOP_HOME_RECOMMEND.Top ? '置顶提示' : '首页推荐';
    }, [ type ]);

    const handleOk = useCallback(async () => {
        const { customDate, dateValue, ...rest } = await modalForm.validateFields();
        if (type === TOP_HOME_RECOMMEND.Recommend && isEdit) {
            const { weight } = rest;
            const query = {
                boardId: data!.boardId,
                postId: data!.id,
                weight,
            };
            const { code, msg } = await setPostWeight(query, clubDeployVersion);
            if (code === 0) {
                message.success('操作成功');
                onOk?.();
                modalForm.resetFields();
            } else {
                message.error(msg || '操作失败');
            }
            return;
        }
        Modal.confirm({
            title,
            icon: <InfoCircleOutlined />,
            content: (
                <div>
                    <span>确认将帖子</span>【{data?.title || data?.id}】
                    <span> {type === TOP_HOME_RECOMMEND.Top ? '置顶' : '首页推荐'}吗</span>？
                </div>
            ),
            okText: '确定',
            okType: 'primary',
            cancelText: '取消',
            onOk: async function () {
                let query = { boardId: [ data?.boardId ].join(',') };
                const res =
                    type === TOP_HOME_RECOMMEND.Top
                        ? await postToTop(
                              query,
                              {
                                  id: data?.id,
                                  isTop: 1,
                                  userId: data?.userId,
                                  userInfoId: data?.userInfoId,
                                  ...rest,
                                  ...(customDate ? { dateValue: customDate } : { dateValue }),
                              },
                              clubDeployVersion
                          )
                        : await postRecommend(
                              {
                                  ...query,
                                  recommend: 1,
                                  id: data?.id,
                                  userId: data?.userId,
                                  userInfoId: data?.userInfoId,
                                  ...rest,
                                  ...(customDate ? { dateValue: customDate } : { dateValue }),
                              },
                              clubDeployVersion
                          );
                if (res.code === 0) {
                    message.success('操作成功');
                    onOk?.();
                    modalForm.resetFields();
                    setCurrentDateType(DATE_VALUE.Day1);
                } else {
                    message.error(res.msg || '操作失败');
                }
            },
            onCancel: function () {},
            autoFocusButton: 'ok',
        });
    }, [ clubDeployVersion, data, isEdit, modalForm, onOk, title, type ]);

    return (
        <Modal
            getContainer={useContentDialogContainer()}
            title={title}
            visible={visible}
            onCancel={() => {
                onCancel?.();
            }}
            footer={
                <div style={{ textAlign: 'right' }}>
                    <Space size="large">
                        <Button
                            onClick={() => {
                                modalForm.resetFields();
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
            <Form form={modalForm} labelCol={{ span: 6 }} onValuesChange={onValuesChange} initialValues={initialValues}>
                <Form.Item label="帖子ID">{data?.id || '-'}</Form.Item>
                <Form.Item label="帖子标题">{data?.title || '-'}</Form.Item>
                <Form.Item
                    name="dateType"
                    label={`${type === TOP_HOME_RECOMMEND.Top ? '置顶' : '首页推荐'}时间类型`}
                    hidden
                >
                    <Select options={DateTypeOptionsData} allowClear />
                </Form.Item>
                {!isEdit && (
                    <Form.Item
                        name="dateValue"
                        label={`${type === TOP_HOME_RECOMMEND.Top ? '置顶' : '首页推荐'}时间`}
                        rules={normalRules()}
                    >
                        <Radio.Group>
                            {TopDateValueOptionsData.map(option => (
                                <Radio
                                    key={option.value}
                                    value={option.value}
                                    onChange={e => {
                                        setCurrentDateType(e.target.value);
                                    }}
                                >
                                    {option.value === DATE_VALUE.Custom && currentDateType === DATE_VALUE.Custom ? (
                                        <Space style={{ marginTop: 10 }}>
                                            <Form.Item name="customDate" rules={normalRules('请输入', true)} noStyle>
                                                <InputNumber min={1} precision={0} />
                                            </Form.Item>
                                            <span>天</span>
                                        </Space>
                                    ) : (
                                        option.label
                                    )}
                                </Radio>
                            ))}
                        </Radio.Group>
                    </Form.Item>
                )}
                {type === TOP_HOME_RECOMMEND.Top && (
                    <>
                        <Form.Item name="isActivityTop" label="仅栏目置顶" rules={normalRules()}>
                            <Radio.Group options={EnabledOptions} />
                        </Form.Item>
                    </>
                )}
                {type === TOP_HOME_RECOMMEND.Recommend && (
                    <>
                        <Form.Item name="weight" required label="优先级" rules={normalRules()}>
                            <Select className="q1-form-item" options={WeightOptions} />
                        </Form.Item>
                    </>
                )}
            </Form>
        </Modal>
    );
}

export default PostToTopFn;
