import { Button, Checkbox, Form, Input, InputNumber, Modal, Radio, Select, Space, Table } from 'antd';
import React, { useCallback, useMemo, useState } from 'react';
import { FormInstance } from 'antd/es/form';
import { arrayMoveImmutable as arrayMove } from 'array-move';

import NumberSwitch from '@/components/NumberSwitch';
import UploadImg from '@/components/uploadFile/UploadImg';
import SortableTable from '@/components/q1Table/sortableTable';

import {
    BoardEditParams,
    DEFALUT_GUESS_DATA,
    GuessDataType,
    OPEN_MODE,
    OpenModeOptions,
    PROMPT_TYPE,
    PromptTypeConstant,
    PromptTypeOptions,
    PromptValues,
    ReplyTypeOptions,
    VoiceRoleOptions,
} from '@ts/club';

import { useClubUploadOption } from '../../../hooks/useClubUploadOption';
import './index.less';
interface RobotFormProps {
    data: BoardEditParams;
    modalForm: FormInstance;
    isCreate: boolean;
}
export default function RobotForm(props: RobotFormProps) {
    const { data, modalForm: form, isCreate } = props;
    const ClubUploadOption = useClubUploadOption({ clubDeployVersion: data.clubDeployVersion || '' });

    const columns = useMemo(() => {
        return [
            {
                title: '',
                dataIndex: 'label',
                width: 100,
            },
            {
                title: '提示语',
                dataIndex: 'value',
                width: 280,
                render: (value: string) => {
                    return (
                        <Form.Item name={value} className="mb-0" rules={[ { required: true, message: '请输入' } ]}>
                            <Input className="q1-form-item-lg" allowClear />
                        </Form.Item>
                    );
                },
            },
        ];
    }, []);

    const renderPromptNode = useCallback(
        (prompts: PROMPT_TYPE[]) => {
            const dataSource = (prompts || []).map(item => {
                return {
                    label: PromptTypeConstant[item],
                    value: PromptValues[item],
                };
            });
            return <Table bordered columns={columns} dataSource={dataSource} pagination={false}></Table>;
        },
        [ columns ]
    );

    const aiColumns = useMemo(() => {
        return [
            {
                title: '显示名称',
                dataIndex: 'name',
                width: 100,
                render: (value: string, record: GuessDataType) => (
                    <>
                        <Form.Item
                            name={[ 'mayAskSetting', record.order, 'name' ]}
                            className="mb-0"
                            rules={[ { required: true, message: '名称不能为空' } ]}
                        >
                            <Input
                                maxLength={20}
                                allowClear
                                className="q1-form-item-lg"
                                onChange={e => {
                                    const val = e.target.value.replace(/[^a-zA-Z\u4e00-\u9fa5]/g, '');
                                    e.target.value = val;
                                }}
                            />
                        </Form.Item>
                        <Form.Item name={[ 'mayAskSetting', record.order, 'order' ]} hidden initialValue={record.order}>
                            <InputNumber />
                        </Form.Item>
                    </>
                ),
            },
            {
                title: 'ICON',
                dataIndex: 'iconUrl',
                width: 120,
                render: (value: string, record: GuessDataType) => {
                    return (
                        <div className="robot-upload-img-container">
                            <Form.Item
                                name={[ 'mayAskSetting', record.order, 'iconUrl' ]}
                                className="mb-0"
                                rules={[ { required: true, message: 'ICON不能为空' } ]}
                            >
                                <UploadImg
                                    imageOrigin=""
                                    uploadOption={ClubUploadOption}
                                    accept="image/png,image/jpeg,image/jpg"
                                    isRandomFileName={true}
                                    sizeType="small"
                                />
                            </Form.Item>
                        </div>
                    );
                },
            },
            {
                title: '回复模式',
                dataIndex: 'replyMode',
                width: 120,
                render: (value: string, record: GuessDataType) => {
                    return (
                        <Form.Item
                            name={[ 'mayAskSetting', record.order, 'replyMode' ]}
                            className="mb-0"
                            rules={[ { required: true, message: '请选择' } ]}
                        >
                            <Select allowClear options={ReplyTypeOptions} />
                        </Form.Item>
                    );
                },
            },
            {
                title: 'prompt提示语/固定文本',
                dataIndex: 'prompts',
                render: (value: string, record: GuessDataType) => {
                    return (
                        <Form.Item
                            name={[ 'mayAskSetting', record.order, 'prompts' ]}
                            className="mb-0"
                            rules={[ { required: true, message: '请输入' } ]}
                        >
                            <Input className="q1-form-item-lg " allowClear maxLength={5000} />
                        </Form.Item>
                    );
                },
            },
        ];
    }, [ ClubUploadOption ]);

    const handleSort = useCallback(
        ({ oldIndex, newIndex }: { oldIndex: number; newIndex: number }) => {
            const mayAskSetting = form.getFieldValue('mayAskSetting') || DEFALUT_GUESS_DATA;
            const reordered = (arrayMove(mayAskSetting, oldIndex, newIndex) as GuessDataType[]).map(
                (item: GuessDataType, index: number) => ({
                    ...item,
                    order: index,
                })
            );
            form.setFields([
                {
                    name: 'mayAskSetting',
                    value: reordered,
                },
            ]);
        },
        [ form ]
    );

    const [ visible, setVisible ] = useState(false);
    const [ openMode, setOpenMode ] = useState(OPEN_MODE.Global);

    const handleCloseOpenModeModal = useCallback(() => {
        form.setFields([
            {
                name: 'robotEnable',
                value: 0,
            },
            {
                name: 'openMode',
                value: OPEN_MODE.Default,
            },
        ]);
        setOpenMode(OPEN_MODE.Global);
        setVisible(false);
    }, [ form ]);

    const handleChangeRobotEnable = useCallback(
        (checked: boolean) => {
            const openMode = form.getFieldValue('openMode') || OPEN_MODE.Default;
            if (isCreate || (checked && openMode === OPEN_MODE.Default)) {
                setVisible(true);
            }
        },
        [ form, isCreate ]
    );

    return useMemo(
        () => (
            <div className="image-form-table">
                <Form.Item name="robotEnable" label="开关" required>
                    <NumberSwitch
                        checkedChildren="开启"
                        unCheckedChildren="关闭"
                        onChange={(value: number) => handleChangeRobotEnable(value === 1)}
                    />
                </Form.Item>
                <Form.Item shouldUpdate={(prev, next) => prev.robotEnable !== next.robotEnable} noStyle>
                    {({ getFieldValue, setFields }) => {
                        const robotEnable = getFieldValue('robotEnable');
                        if (robotEnable) {
                            return (
                                <>
                                    <Form.Item name="openMode" label="开启模式" required>
                                        <Radio.Group disabled options={OpenModeOptions} />
                                    </Form.Item>
                                    <Form.Item shouldUpdate={(prev, next) => prev.openMode !== next.openMode} noStyle>
                                        {({ getFieldValue }) => {
                                            const openMode = getFieldValue('openMode');
                                            if (openMode === OPEN_MODE.Adopt) {
                                                return (
                                                    <Form.Item required label="AI形象" labelCol={{ span: 3 }}>
                                                        <Space>
                                                            <Form.Item
                                                                name="normalImage"
                                                                extra="正常形态 512*512,gif格式"
                                                                className="mb-0 mr-10"
                                                            >
                                                                <UploadImg
                                                                    imageOrigin=""
                                                                    uploadOption={ClubUploadOption}
                                                                    maxSize={10 * 1024 * 1024}
                                                                    accept="image/gif"
                                                                    isRandomFileName={true}
                                                                />
                                                            </Form.Item>
                                                            <Form.Item
                                                                name="greetImage"
                                                                extra="打招呼形态 512*512,gif格式"
                                                                className="mb-0 mr-10"
                                                            >
                                                                <UploadImg
                                                                    imageOrigin=""
                                                                    uploadOption={ClubUploadOption}
                                                                    maxSize={10 * 1024 * 1024}
                                                                    accept="image/gif"
                                                                    isRandomFileName={true}
                                                                />
                                                            </Form.Item>
                                                            <Form.Item
                                                                name="petImage"
                                                                extra="宠物ICON，128*128"
                                                                className="mb-0"
                                                            >
                                                                <UploadImg
                                                                    imageOrigin=""
                                                                    uploadOption={ClubUploadOption}
                                                                    maxSize={1 * 1024 * 1024}
                                                                    accept="image/png,image/jpeg"
                                                                    isRandomFileName={true}
                                                                />
                                                            </Form.Item>
                                                        </Space>
                                                    </Form.Item>
                                                );
                                            }
                                            return null;
                                        }}
                                    </Form.Item>
                                    <Form.Item
                                        name="robotImageUrl"
                                        label="聊天背景"
                                        extra="建议：尺寸414*700，png/jpg格式，内存1M以内"
                                        labelCol={{ span: 3 }}
                                    >
                                        <UploadImg
                                            imageOrigin=""
                                            uploadOption={ClubUploadOption}
                                            maxSize={1 * 1024 * 1024}
                                            accept="image/png,image/jpeg"
                                            isRandomFileName={true}
                                        />
                                    </Form.Item>
                                    <Form.Item name="prompts" label="创作灵感" labelCol={{ span: 3 }}>
                                        <Checkbox.Group
                                            options={PromptTypeOptions}
                                            onChange={value => {
                                                PromptTypeOptions.forEach(item => {
                                                    if (!value.includes(item.value)) {
                                                        setFields([
                                                            {
                                                                name: PromptValues[item.value as PROMPT_TYPE],
                                                                value: '',
                                                            },
                                                        ]);
                                                    }
                                                });
                                            }}
                                        />
                                    </Form.Item>
                                    <Form.Item noStyle shouldUpdate={(prev, next) => prev.prompts !== next.prompts}>
                                        {({ getFieldValue }) => {
                                            const prompts = getFieldValue('prompts');
                                            if (!prompts || prompts.length === 0) {
                                                return null;
                                            }
                                            return (
                                                <Form.Item label="prompt" labelCol={{ span: 3 }} required>
                                                    {renderPromptNode(prompts)}
                                                </Form.Item>
                                            );
                                        }}
                                    </Form.Item>
                                    <Form.Item label="反馈设置" required labelCol={{ span: 3 }}></Form.Item>
                                    <Form.Item wrapperCol={{ offset: 3 }}>
                                        <Space>
                                            <span>标准回答赞成/反对反馈按钮组下发概率</span>
                                            <Form.Item
                                                name="answerProbability"
                                                noStyle
                                                rules={[ { required: true, message: '请输入' } ]}
                                            >
                                                <InputNumber max={100} min={0} precision={0} />
                                            </Form.Item>
                                            <span>%</span>
                                        </Space>
                                    </Form.Item>
                                    <Form.Item wrapperCol={{ offset: 3 }}>
                                        <Space>
                                            <span>自由回答赞成/反对反馈按钮组下发概率</span>
                                            <Form.Item
                                                noStyle
                                                name="aiProbability"
                                                rules={[ { required: true, message: '请输入' } ]}
                                            >
                                                <InputNumber max={100} min={0} precision={0} />
                                            </Form.Item>
                                            <span>%</span>
                                        </Space>
                                    </Form.Item>
                                    <Form.Item name="voiceOnoff" label="语音输入" required>
                                        <NumberSwitch checkedChildren="开启" unCheckedChildren="关闭" />
                                    </Form.Item>
                                    <Form.Item shouldUpdate={(prev, next) => prev.voiceOnoff !== next.voiceOnoff}>
                                        {({ getFieldValue }) => {
                                            const voiceOnoff = getFieldValue('voiceOnoff');
                                            if (!voiceOnoff) {
                                                return null;
                                            }
                                            return (
                                                <>
                                                    <Form.Item labelCol={{ span: 3 }} name="voicePack" label="语音包">
                                                        <Select
                                                            className="q1-form-item-lg"
                                                            options={VoiceRoleOptions}
                                                        />
                                                    </Form.Item>
                                                    <Form.Item
                                                        noStyle
                                                        shouldUpdate={(prev, next) =>
                                                            prev.mayAskSetting !== next.mayAskSetting
                                                        }
                                                    >
                                                        {({ getFieldValue }) => {
                                                            let mayAskSetting = getFieldValue('mayAskSetting');
                                                            if (!mayAskSetting || mayAskSetting.length === 0) {
                                                                mayAskSetting = DEFALUT_GUESS_DATA;
                                                            }
                                                            return (
                                                                <Form.Item
                                                                    label="猜你想问"
                                                                    required
                                                                    className="guess-question-item"
                                                                    labelCol={{ span: 3 }}
                                                                >
                                                                    <SortableTable
                                                                        helperClass="row-dragging-club__board"
                                                                        onChangeSort={handleSort}
                                                                        columns={aiColumns}
                                                                        pagination={false}
                                                                        size="small"
                                                                        dataSource={mayAskSetting}
                                                                    />
                                                                </Form.Item>
                                                            );
                                                        }}
                                                    </Form.Item>
                                                </>
                                            );
                                        }}
                                    </Form.Item>
                                    <Modal
                                        title="机器人开启模式"
                                        visible={visible}
                                        closable={false}
                                        maskClosable={false}
                                        footer={
                                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                <Button onClick={handleCloseOpenModeModal}>取消</Button>
                                                <Button
                                                    type="primary"
                                                    onClick={() => {
                                                        form.setFields([
                                                            {
                                                                name: 'openMode',
                                                                value: openMode,
                                                            },
                                                        ]);
                                                        setVisible(false);
                                                    }}
                                                >
                                                    确认
                                                </Button>
                                            </div>
                                        }
                                    >
                                        <Radio.Group
                                            options={OpenModeOptions}
                                            className="mb-10"
                                            value={openMode}
                                            onChange={e => {
                                                const openMode = e.target.value;
                                                setOpenMode(openMode);
                                            }}
                                        />
                                        <p className="mb-10">
                                            *全局开放即所有玩家可见，曝光率高，用于机器人作为辅助GM解答问题。
                                        </p>
                                        <p className="mb-10">
                                            *领养制即需要玩家自行前往“我的”页面领养，曝光率低一些，但会结合宠物系统，后续会开放成长线
                                        </p>
                                        <p>每个版块模式只允许选择一次不允许变更，请谨慎选择。</p>
                                    </Modal>
                                </>
                            );
                        } else {
                            return null;
                        }
                    }}
                </Form.Item>
            </div>
        ),
        [
            ClubUploadOption,
            aiColumns,
            form,
            handleChangeRobotEnable,
            handleCloseOpenModeModal,
            handleSort,
            openMode,
            renderPromptNode,
            visible,
        ]
    );
}
