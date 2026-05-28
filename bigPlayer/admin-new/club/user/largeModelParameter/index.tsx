import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Col, Divider, Form, Input, InputNumber, Row, Select, Slider, Space, Spin, Table, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { get } from 'lodash';
import { FilterBox } from 'q1-antd';

import BlockHeader from '@/components/BlockHeader';
import { useContentPermissionFn, useRevisible } from '@/context';
import { getModelSetting, updateModelSetting } from '@/api/club';
import { normalRuleValidator } from '@/utils/lib';

import { ClubDeployVersionOptionsData, ModelSetting } from '@ts/club';

require('./index.less');

const MIN = 0;
const MAX_POINTS = 100;
const BREAK_DOWN_MAX = 20;
const MATCH_MAX = 10;
const MIN_BEHAVIOR = 1;
const COMMON_MARKS = {
    0: '0%',
    100: '100%',
};
const POST_TEXT_MAX = 10000;
const ACTIVITY_TEXT_MAX = 500;
const initVal = { field: 'accountId', clubDeployVersion: get(ClubDeployVersionOptionsData, '0.value') };

function LargeModelParameter() {
    const { hasFunctionPermit } = useContentPermissionFn();
    const [ loading, setLoading ] = useState(false);
    const [ form ] = Form.useForm();
    const filterbox = FilterBox.useFilterBox();

    // 原始数据
    const [ initData, setInitData ] = useState<ModelSetting>({
        categoryStrength: 50,
        creationTagDecompositionStrength: 0,
        creationMatchLevel: 0,
        postCount: 0,
        commentCount: 0,
        likeCount: 0,
        favoriteCount: 0,
        viewCount: 0,
        postMatch: 70, // 帖子匹配度默认 70%
        activityMatch: 50, // 动态匹配度默认 50%
        associationStrength: 50,
        commentRule: '',
        commentPostThreshold: 500,
        commentActivityThreshold: 100,
        baseScore: 100,
        priority: 0,
        modelMatchScore: 30,
        freshnessScore: 20,
    });

    const getInitData = useCallback(async () => {
        setLoading(true);
        try {
            const { clubDeployVersion } = await filterbox.validate();
            const { code, data, msg } = await getModelSetting(clubDeployVersion);
            if (code === 0 && data) {
                setInitData(v => ({ ...v, ...data }));
                form.setFieldsValue(data);
            } else {
                message.error(msg);
            }
        } finally {
            setLoading(false);
        }
    }, [ filterbox, form ]);

    useEffect(() => {
        getInitData();
    }, [ getInitData ]);

    useRevisible(() => {
        getInitData();
    });

    const behaviorData = useMemo(() => {
        const { postCount, commentCount, likeCount, favoriteCount, viewCount } = initData;
        return {
            behavior: '权重',
            postCount,
            commentCount,
            likeCount,
            favoriteCount,
            viewCount,
        };
    }, [ initData ]);

    const recommendData = useMemo(() => {
        const { baseScore, priority, modelMatchScore, freshnessScore } = initData;
        return [
            {
                behavior: '权重',
                baseScore,
                priority,
                modelMatchScore,
                freshnessScore,
            },
        ];
    }, [ initData ]);

    const [ isEdit, setIsEdit ] = useState(false);

    const dataSource = useMemo(() => {
        return [ behaviorData ];
    }, [ behaviorData ]);

    const [ submitLoading, setSubmitLoading ] = useState(false);
    const onSubmit = useCallback(async () => {
        setSubmitLoading(true);
        try {
            const { clubDeployVersion } = await filterbox.validate();
            const values = await form.validateFields();
            const { code, msg } = await updateModelSetting(values, clubDeployVersion);
            if (code === 0) {
                message.success('编辑成功');
                setIsEdit(false);
                setInitData(values);
                form.setFieldsValue(values);
            } else {
                message.error(msg || '编辑失败');
            }
        } finally {
            setSubmitLoading(false);
        }
    }, [ filterbox, form, setIsEdit ]);

    const columns: ColumnsType<any> = useMemo(() => {
        return [
            {
                dataIndex: 'behavior',
                title: '行为',
                switch: 1,
                align: 'left',
            },
            {
                dataIndex: 'postCount',
                title: '发帖',
                switch: 1,
                align: 'left',
                render: (v: number) => {
                    return isEdit ? (
                        <Form.Item name="postCount" className="mb-0" rules={normalRuleValidator('请输入', true)}>
                            <InputNumber min={MIN_BEHAVIOR} />
                        </Form.Item>
                    ) : (
                        v
                    );
                },
            },
            {
                dataIndex: 'commentCount',
                title: '评论',
                switch: 1,
                align: 'left',
                render: (v: number) => {
                    return isEdit ? (
                        <Form.Item name="commentCount" className="mb-0" rules={normalRuleValidator('请输入', true)}>
                            <InputNumber min={MIN_BEHAVIOR} />
                        </Form.Item>
                    ) : (
                        v
                    );
                },
            },
            {
                dataIndex: 'likeCount',
                title: '点赞',
                switch: 1,
                align: 'left',
                render: (v: number) => {
                    return isEdit ? (
                        <Form.Item name="likeCount" className="mb-0" rules={normalRuleValidator('请输入', true)}>
                            <InputNumber min={MIN_BEHAVIOR} />
                        </Form.Item>
                    ) : (
                        v
                    );
                },
            },
            {
                dataIndex: 'favoriteCount',
                title: '收藏',
                switch: 1,
                align: 'left',
                render: (v: number) => {
                    return isEdit ? (
                        <Form.Item name="favoriteCount" className="mb-0" rules={normalRuleValidator('请输入', true)}>
                            <InputNumber min={MIN_BEHAVIOR} />
                        </Form.Item>
                    ) : (
                        v
                    );
                },
            },
            {
                dataIndex: 'viewCount',
                title: '浏览',
                switch: 1,
                align: 'left',
                render: (v: number) => {
                    return isEdit ? (
                        <Form.Item name="viewCount" className="mb-0" rules={normalRuleValidator('请输入', true)}>
                            <InputNumber min={MIN_BEHAVIOR} />
                        </Form.Item>
                    ) : (
                        v
                    );
                },
            },
        ];
    }, [ isEdit ]);

    const recommendColumns: ColumnsType<any> = useMemo(() => {
        return [
            {
                dataIndex: 'behavior',
                title: '行为',
                switch: 1,
                align: 'left',
            },
            {
                dataIndex: 'baseScore',
                title: '首页推荐内容基础分',
                switch: 1,
                align: 'left',
                render: (v: number) => {
                    return isEdit ? (
                        <Form.Item name="baseScore" className="mb-0" rules={normalRuleValidator('请输入', true)}>
                            <InputNumber min={MIN_BEHAVIOR} precision={0} />
                        </Form.Item>
                    ) : (
                        v
                    );
                },
            },
            {
                dataIndex: 'priority',
                title: '首页推荐优先级',
                switch: 1,
                align: 'left',
                render: (v: number) => {
                    return isEdit ? (
                        <Form.Item name="priority" className="mb-0" rules={normalRuleValidator('请输入', true)}>
                            <InputNumber min={MIN_BEHAVIOR} precision={0} />
                        </Form.Item>
                    ) : (
                        v
                    );
                },
            },
            {
                dataIndex: 'modelMatchScore',
                title: '大模型匹配',
                switch: 1,
                align: 'left',
                render: (v: number) => {
                    return isEdit ? (
                        <Form.Item name="modelMatchScore" className="mb-0" rules={normalRuleValidator('请输入', true)}>
                            <InputNumber min={MIN_BEHAVIOR} precision={0} />
                        </Form.Item>
                    ) : (
                        v
                    );
                },
            },
            {
                dataIndex: 'freshnessScore',
                title: '新鲜度',
                switch: 1,
                align: 'left',
                render: (v: number) => {
                    return isEdit ? (
                        <Form.Item name="freshnessScore" className="mb-0" rules={normalRuleValidator('请输入', true)}>
                            <InputNumber min={MIN_BEHAVIOR} precision={0} />
                        </Form.Item>
                    ) : (
                        v
                    );
                },
            },
        ];
    }, [ isEdit ]);

    const handleSliderChange = useCallback(
        value => {
            const evenValue = Math.round(value / 2) * 2; // 四舍五入到最近的偶数
            form.setFieldsValue({ creationMatchLevel: evenValue });
        },
        [ form ]
    );

    const footer = useMemo(() => {
        return (
            <div>
                <Space size={4} className="flex-end">
                    <Button
                        loading={submitLoading}
                        onClick={() => {
                            form.setFields([ { name: 'commentRule', errors: [] } ]);
                            form.setFieldsValue(initData);
                            setIsEdit(false);
                        }}
                    >
                        取消
                    </Button>
                    {isEdit ? (
                        <Button type="primary" onClick={onSubmit} loading={submitLoading}>
                            确定
                        </Button>
                    ) : (
                        <Button
                            type="primary"
                            onClick={() => {
                                setIsEdit(true);
                            }}
                        >
                            编辑
                        </Button>
                    )}
                </Space>
            </div>
        );
    }, [ form, initData, isEdit, onSubmit, submitLoading ]);

    return (
        <Spin spinning={loading}>
            <div className="q1-content__main q1-content__main_white club-large-model-page">
                <FilterBox query={getInitData} tableName="clubBoardTable" context={filterbox} initialValues={initVal}>
                    <FilterBox.Item
                        name="clubDeployVersion"
                        label="数据中心"
                        rules={[ { message: '请选择', required: true } ]}
                    >
                        <Select options={ClubDeployVersionOptionsData} onChange={getInitData}></Select>
                    </FilterBox.Item>
                </FilterBox>
                <Form form={form} initialValues={initData}>
                    <BlockHeader title="标签权重" hasBottom size="middle" />
                    <Row className="flex-1" style={{ paddingLeft: 140, marginBottom: 15 }}>
                        <Col span={18}>
                            <Table columns={columns} dataSource={dataSource} bordered pagination={false} />
                        </Col>
                    </Row>
                    <BlockHeader title="推荐模块内容权重" hasBottom size="middle" />
                    <Row className="flex-1" style={{ paddingLeft: 140, marginBottom: 15 }}>
                        <Col span={18}>
                            <Table columns={recommendColumns} dataSource={recommendData} bordered pagination={false} />
                        </Col>
                    </Row>
                    <BlockHeader title="参数设置" hasBottom size="middle" />
                    <Divider orientation="left" plain>
                        推荐模块内容权重
                    </Divider>
                    <div className="flex-items-center">
                        <p className="large-model-label">标签归类强度：</p>
                        <Row className="flex-1">
                            <Col span={10}>
                                <Form.Item name="categoryStrength" noStyle>
                                    <Slider disabled={!isEdit} min={MIN} max={MAX_POINTS} marks={COMMON_MARKS} />
                                </Form.Item>
                            </Col>
                            <Col span={6}>
                                <Space className="ml-20 flex-center">
                                    玩家用户画像标签合并强度
                                    {isEdit ? (
                                        <Form.Item name="categoryStrength" noStyle>
                                            <InputNumber disabled={!isEdit} min={MIN} max={MAX_POINTS} />
                                        </Form.Item>
                                    ) : (
                                        initData.categoryStrength
                                    )}
                                    <span>%</span>
                                </Space>
                            </Col>
                        </Row>
                    </div>
                    <div className="flex-items-center">
                        <p className="large-model-label">创作标签分解强度：</p>
                        <Row className="flex-1">
                            <Col span={10}>
                                <Form.Item name="creationTagDecompositionStrength" noStyle>
                                    <Slider
                                        disabled={!isEdit}
                                        min={MIN}
                                        max={BREAK_DOWN_MAX}
                                        marks={{
                                            0: 0,
                                            20: 20,
                                        }}
                                    />
                                </Form.Item>
                            </Col>
                            <Col span={6}>
                                <Space className="ml-20 flex-center">
                                    <span>至多</span>
                                    {isEdit ? (
                                        <Form.Item name="creationTagDecompositionStrength" noStyle>
                                            <InputNumber disabled={!isEdit} min={MIN} max={BREAK_DOWN_MAX} />
                                        </Form.Item>
                                    ) : (
                                        initData.creationTagDecompositionStrength
                                    )}

                                    <span>个标签</span>
                                </Space>
                            </Col>
                        </Row>
                    </div>
                    <div className="flex-items-center">
                        <p className="large-model-label">创作匹配程度：</p>
                        <Row className="flex-1">
                            <Col span={10}>
                                <Form.Item name="creationMatchLevel" noStyle>
                                    <Slider
                                        disabled={!isEdit}
                                        min={MIN}
                                        max={MATCH_MAX}
                                        marks={{
                                            0: 0,
                                            2: 2,
                                            4: 4,
                                            6: 6,
                                            8: 8,
                                            10: 10,
                                        }}
                                        onChange={handleSliderChange}
                                    />
                                </Form.Item>
                            </Col>
                            <Col span={6}>
                                <Space className="ml-20 flex-center">
                                    <span>用</span>
                                    {isEdit ? (
                                        <Form.Item name="creationMatchLevel" noStyle>
                                            <InputNumber
                                                disabled={!isEdit}
                                                min={MIN}
                                                max={MATCH_MAX}
                                                onChange={handleSliderChange}
                                                onStep={(value, { type }) => {
                                                    if (type === 'up') {
                                                        form.setFieldsValue({ creationMatchLevel: value + 1 });
                                                    } else {
                                                        form.setFieldsValue({ creationMatchLevel: value - 1 });
                                                    }
                                                }}
                                            />
                                        </Form.Item>
                                    ) : (
                                        initData.creationMatchLevel
                                    )}

                                    <span>个标签进行匹配</span>
                                </Space>
                            </Col>
                        </Row>
                    </div>
                    <div className="flex-items-center">
                        <p className="large-model-label">发现模块内容分布：</p>
                        <Row className="flex-1">
                            <Col span={10}>
                                <Form.Item name="postMatch" noStyle>
                                    <Slider disabled={!isEdit} min={MIN} max={MAX_POINTS} marks={COMMON_MARKS} />
                                </Form.Item>
                            </Col>
                            <Col span={6}>
                                <Space className="ml-20 flex-center">
                                    <span>帖子匹配度</span>
                                    {isEdit ? (
                                        <Form.Item name="postMatch" noStyle>
                                            <InputNumber disabled={!isEdit} min={MIN} max={MAX_POINTS} />
                                        </Form.Item>
                                    ) : (
                                        initData.postMatch
                                    )}

                                    <span>%</span>
                                </Space>
                            </Col>
                        </Row>
                    </div>

                    <div className="flex-items-center">
                        <p className="large-model-label"></p>
                        <Row className="flex-1">
                            <Col span={10}>
                                <Form.Item name="activityMatch" noStyle>
                                    <Slider disabled={!isEdit} min={MIN} max={MAX_POINTS} marks={COMMON_MARKS} />
                                </Form.Item>
                            </Col>
                            <Col span={6}>
                                <Space className="ml-20 flex-center">
                                    <span>动态匹配度</span>
                                    {isEdit ? (
                                        <Form.Item name="activityMatch" noStyle>
                                            <InputNumber disabled={!isEdit} min={MIN} max={MAX_POINTS} />
                                        </Form.Item>
                                    ) : (
                                        initData.activityMatch
                                    )}

                                    <span>%</span>
                                </Space>
                            </Col>
                        </Row>
                    </div>
                    <div className="flex-items-center">
                        <p className="large-model-label">搜索关联强度：</p>
                        <Row className="flex-1">
                            <Col span={10}>
                                <Form.Item name="associationStrength" noStyle>
                                    <Slider disabled={!isEdit} min={MIN} max={MAX_POINTS} marks={COMMON_MARKS} />
                                </Form.Item>
                            </Col>
                            <Col span={6}>
                                <Space className="ml-20 flex-center">
                                    搜索关联内容的覆盖面
                                    {isEdit ? (
                                        <Form.Item name="associationStrength" noStyle>
                                            <InputNumber disabled={!isEdit} min={MIN} max={MAX_POINTS} />
                                        </Form.Item>
                                    ) : (
                                        initData.associationStrength
                                    )}
                                    <span>%</span>
                                </Space>
                            </Col>
                        </Row>
                    </div>
                    <Divider orientation="left" plain>
                        快捷评论设置
                    </Divider>
                    <div className="flex-items-center">
                        <p className="large-model-label">快捷评论门槛</p>
                        <Row className="flex-1">
                            <Col span={10}>
                                <Form.Item name="commentPostThreshold" noStyle>
                                    <Slider
                                        disabled={!isEdit}
                                        min={MIN}
                                        max={POST_TEXT_MAX}
                                        marks={{
                                            0: 0,
                                            10000: 10000,
                                        }}
                                    />
                                </Form.Item>
                            </Col>
                            <Col span={6}>
                                <Space className="ml-20 flex-center">
                                    <span>帖子文字数量≥</span>
                                    {isEdit ? (
                                        <Form.Item name="commentPostThreshold" noStyle>
                                            <InputNumber disabled={!isEdit} min={MIN} max={POST_TEXT_MAX} />
                                        </Form.Item>
                                    ) : (
                                        initData.commentPostThreshold
                                    )}
                                </Space>
                            </Col>
                        </Row>
                    </div>
                    <div className="flex-items-center">
                        <p className="large-model-label"></p>
                        <Row className="flex-1">
                            <Col span={10}>
                                <Form.Item name="commentActivityThreshold" noStyle>
                                    <Slider
                                        disabled={!isEdit}
                                        min={MIN}
                                        max={ACTIVITY_TEXT_MAX}
                                        marks={{
                                            0: 0,
                                            500: 500,
                                        }}
                                    />
                                </Form.Item>
                            </Col>
                            <Col span={6}>
                                <Space className="ml-20 flex-center">
                                    <span>动态文字数量≥</span>
                                    {isEdit ? (
                                        <Form.Item name="commentActivityThreshold" noStyle>
                                            <InputNumber disabled={!isEdit} min={MIN} max={ACTIVITY_TEXT_MAX} />
                                        </Form.Item>
                                    ) : (
                                        initData.commentActivityThreshold
                                    )}
                                </Space>
                            </Col>
                        </Row>
                    </div>
                    <div className="flex-items-center">
                        <p className="large-model-label">快捷评论规则</p>
                        <Row className="flex-1">
                            <Col span={10}>
                                <Form.Item
                                    name="commentRule"
                                    rules={[ { required: true, message: '快捷评论规则不能为空！' } ]}
                                >
                                    <Input.TextArea
                                        disabled={!isEdit}
                                        placeholder='请自定义输入你对快捷评论生成的规则要求，如"5个字以内，智能一些，看起来不要像AI"'
                                    />
                                </Form.Item>
                            </Col>
                        </Row>
                    </div>
                </Form>
                <Divider />
                {hasFunctionPermit('btn__update__club_model_setting') ? footer : null}
            </div>
        </Spin>
    );
}

export default LargeModelParameter;
