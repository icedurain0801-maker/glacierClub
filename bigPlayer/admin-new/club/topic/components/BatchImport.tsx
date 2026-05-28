import React, { useState, useCallback, useMemo } from 'react';
import { Button, Drawer, Form, Input, message, Radio, Select, Tag, Checkbox } from 'antd';
import moment from 'moment';

import { batchImportPost } from '@/api/club';
import RangePicker from '@/components/RangePicker';
import { setUtcEndTimeAndFormat, setUtcStartTimeAndFormat } from '@/utils/date';

import { CLUB_ENVIRONMENT_ENUM, MOMENT_TYPE, MomentFilterOptionsData } from '@ts/club';
import { ClubTopicItem, RULE_TYPE, RuleTypeOptions, TOPIC_IMPORT_TYPE, TopicImportTypeOptions } from '@ts/clubTopic';

import usePostSelect, { extractId } from '../../board/hooks/usePostSelect';

interface IProps {
    clubDeployVersion: CLUB_ENVIRONMENT_ENUM;
    data: ClubTopicItem;
    visible: boolean;
    onOk(shouldChangeTab: boolean): void;
    onClose(): void;
}

interface KeywordComponentProps {
    value?: string[];
    onChange?: (value: string[]) => void;
}

function KeywordComponent(props: KeywordComponentProps) {
    const { value, onChange } = props;

    const [ inputValue, setInputValue ] = useState('');

    const close = useCallback(
        (e, v) => {
            e.preventDefault();
            const filterVal = (value || []).filter(x => x !== v);

            onChange && onChange(filterVal);
        },
        [ onChange, value ]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (!inputValue) {
                return;
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                if (value?.length === 10) {
                    return message.warning('最多可添加10个');
                }
                if (value?.includes(inputValue!)) {
                    return message.warning('已存在该关键词');
                }
                onChange && onChange((value || []).concat(inputValue!));
                setInputValue('');
            }
        },
        [ inputValue, onChange, value ]
    );

    return (
        <div>
            <Input
                className="q1-form-item-xl"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="请输入关键字，按回车确认添加"
            />
            <div>
                {value?.map(x => (
                    <Tag
                        key={x}
                        color="blue"
                        closable
                        onClose={e => close(e, x)}
                        style={{ marginTop: '15px', padding: '4px 10px' }}
                    >
                        {x}
                    </Tag>
                ))}
            </div>
        </div>
    );
}

const LabelCol = {
    span: 5,
};

export default function BatchImport(props: IProps) {
    const [ modalForm ] = Form.useForm();
    const { clubDeployVersion, data, visible, onClose, onOk } = props;
    const [ loading, setLoading ] = useState(false);

    const { selectNode, selectedPostIds, setSelectedPostIds } = usePostSelect({
        init: !!(visible && data),
        clubDeployVersion,
        boardId: data.boardId,
        isTitleKey: true,
    });

    const handleSubmit = useCallback(async () => {
        setLoading(true);
        try {
            const { type, postIds = [], createTime, ...rest } = await modalForm.validateFields();
            let params = {
                boardId: data!.boardId,
                type,
            };
            if (type === TOPIC_IMPORT_TYPE.Import) {
                params = {
                    ...params,
                    ...rest,
                    postIds: postIds?.map((x: string) => extractId(x)),
                };
            } else {
                params = {
                    ...params,
                    ...rest,
                    beginCreateTime: setUtcStartTimeAndFormat(createTime[0]),
                    endCreateTime: setUtcEndTimeAndFormat(createTime[1]),
                };
            }
            const query = {
                boardId: data!.boardId,
                topicId: data.id,
                topicName: data.name,
            };
            const { code, message: msg } = await batchImportPost(query, params, clubDeployVersion);
            if (code === 0) {
                message.success('话题数据已更新');
                modalForm.resetFields();
                setSelectedPostIds([]);
                onOk(false);
            } else {
                message.error(msg || '请检查数据重新导入');
            }
        } finally {
            setLoading(false);
        }
    }, [ clubDeployVersion, data, modalForm, onOk, setSelectedPostIds ]);

    const handleClose = useCallback(
        (id: number) => {
            const postIds = modalForm.getFieldValue('postIds') || [];
            const filterPostIds = postIds?.filter((x: number) => x !== id);
            modalForm.setFields([
                {
                    name: 'postIds',
                    value: filterPostIds,
                },
            ]);
            setSelectedPostIds(filterPostIds);
        },
        [ modalForm, setSelectedPostIds ]
    );

    return useMemo(
        () => (
            <Drawer
                width={580}
                title="导入帖文"
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
                        type: TOPIC_IMPORT_TYPE.Import,
                    }}
                >
                    <Form.Item label="话题ID">{data ? data.id : ''}</Form.Item>
                    <Form.Item label="话题名称">{data ? data.name : ''}</Form.Item>
                    <Form.Item label="导入方式" name="type" required>
                        <Radio.Group
                            options={TopicImportTypeOptions}
                            onChange={e => {
                                if (e.target.value === TOPIC_IMPORT_TYPE.Import) {
                                    modalForm.resetFields();
                                } else {
                                    modalForm.setFieldsValue({
                                        type: TOPIC_IMPORT_TYPE.BatchImport,
                                        postType: [],
                                        ruleType: RULE_TYPE.Any,
                                        keys: [],
                                    });
                                }
                            }}
                        ></Radio.Group>
                    </Form.Item>
                    <Form.Item shouldUpdate={(prev, next) => prev.type !== next.type}>
                        {({ getFieldValue }) => {
                            const type = getFieldValue('type');
                            if (type === TOPIC_IMPORT_TYPE.Import) {
                                return (
                                    <>
                                        <Form.Item
                                            label="帖子"
                                            name="postIds"
                                            labelCol={{ span: 4 }}
                                            rules={[
                                                {
                                                    validator: (rule: any, value: number[]) => {
                                                        if (!value || value?.length === 0) {
                                                            return Promise.reject('请选择帖子');
                                                        }
                                                        if (value?.length > 100) {
                                                            return Promise.reject('最多可添加100个');
                                                        }

                                                        return Promise.resolve();
                                                    },
                                                },
                                            ]}
                                            required
                                            className="mb-0"
                                        >
                                            {selectNode}
                                        </Form.Item>
                                        <Form.Item wrapperCol={{ offset: 4 }}>
                                            <div style={{ maxHeight: 406, overflowY: 'auto' }}>
                                                {selectedPostIds?.map(id => (
                                                    <Tag
                                                        key={id}
                                                        color="blue"
                                                        closable
                                                        onClose={e => handleClose(id)}
                                                        style={{ marginTop: '15px', padding: '4px 10px' }}
                                                    >
                                                        {id}
                                                    </Tag>
                                                ))}
                                            </div>
                                        </Form.Item>
                                        {selectedPostIds?.length > 0 ? (
                                            <Form.Item wrapperCol={{ offset: 4 }}>
                                                <div>
                                                    合计&nbsp;
                                                    <span className="color-blue font-bold">
                                                        {selectedPostIds?.length}
                                                    </span>
                                                    &nbsp;项
                                                </div>
                                            </Form.Item>
                                        ) : null}
                                    </>
                                );
                            } else {
                                return (
                                    <>
                                        <Form.Item
                                            required
                                            label="帖文创建时间"
                                            name="createTime"
                                            labelCol={LabelCol}
                                            rules={[
                                                {
                                                    validator: (rule: any, value: any) => {
                                                        if (!value || !value[0] || !value[1]) {
                                                            return Promise.reject('请选择时间');
                                                        }

                                                        // 结束时间不能大于当前时间
                                                        if (value[1].isAfter(moment())) {
                                                            return Promise.reject('结束时间不能大于当前时间');
                                                        }

                                                        if (value && value[0] && value[1]) {
                                                            const start = moment(value[0]);
                                                            // 把结束时间设为当天的 23:59:59
                                                            const end = moment(value[1]).endOf('day');

                                                            if (end.isAfter(start.clone().add(6, 'months'))) {
                                                                return Promise.reject('时间跨度不能超过半年');
                                                            }
                                                        }

                                                        return Promise.resolve();
                                                    },
                                                },
                                            ]}
                                        >
                                            <RangePicker
                                                disabledDate={current => {
                                                    return current && current > moment().endOf('day');
                                                }}
                                            />
                                        </Form.Item>
                                        <Form.Item
                                            label="帖子类型"
                                            name="postType"
                                            labelCol={LabelCol}
                                            required
                                            rules={[ { required: true, message: '请选择帖子类型' } ]}
                                        >
                                            <Checkbox.Group options={MomentFilterOptionsData} />
                                        </Form.Item>
                                        <Form.Item
                                            label="匹配规则"
                                            name="ruleType"
                                            labelCol={LabelCol}
                                            required
                                            rules={[ { required: true, message: '请选择帖子类型' } ]}
                                        >
                                            <Select className="q1-form-item-xl" options={RuleTypeOptions} />
                                        </Form.Item>
                                        <Form.Item
                                            label="匹配关键字"
                                            required
                                            name="keys"
                                            labelCol={LabelCol}
                                            rules={[
                                                {
                                                    validator: (rule: any, value: string[]) => {
                                                        if (!value || value?.length === 0) {
                                                            return Promise.reject('请添加匹配关键词');
                                                        }
                                                        return Promise.resolve();
                                                    },
                                                },
                                            ]}
                                        >
                                            <KeywordComponent />
                                        </Form.Item>
                                    </>
                                );
                            }
                        }}
                    </Form.Item>
                </Form>
            </Drawer>
        ),
        [ visible, onClose, loading, handleSubmit, modalForm, data, selectNode, selectedPostIds, handleClose ]
    );
}
