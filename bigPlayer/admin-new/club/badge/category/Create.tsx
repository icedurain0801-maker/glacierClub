import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, Drawer, Form, FormInstance, Input, InputNumber, message, Modal, Select, Tabs, Tag } from 'antd';
import { get, isNumber, keyBy, map, sortBy } from 'lodash';

import { inputEmojiRule } from '@/utils/helper';
import { createBadgeCategory, updateBadgeCategory } from '@/api/clubBadge';

import { BOARD_PERMIT_SEPARATE, BoardPermitOptionsType, CLUB_DEPLOY_VERSION } from '@ts/club';
import { EditBadgeCategoryData, MultiLang } from '@ts/clubBadge';

interface ClubBadgeCategoryCreateProps {
    clubBoardOptions: BoardPermitOptionsType[];
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    data: EditBadgeCategoryData;
    visible: boolean;
    onOk(): void;
    onClose(): void;
    languageOptions: Array<{
        label: string;
        value: string;
    }>;
    langMap: { [k in string]: string };
}

export default function ClubBadgeCategoryCreate(props: ClubBadgeCategoryCreateProps) {
    const [ modalForm ] = Form.useForm();
    const { clubDeployVersion, data, visible, onClose, languageOptions, langMap, onOk } = props;
    const [ loading, setLoading ] = useState(false);
    const isCreate = useMemo(() => !data?.id, [ data ]);
    const isHomeLand = useMemo(() => (data?.boardId ?? '').startsWith('zh'), [ data ]);

    const [ activeKey, setActiveKey ] = useState('zh-CN');

    useEffect(() => {
        setActiveKey(isHomeLand ? 'zh-CN' : 'en-US');
    }, [ isHomeLand ]);

    useEffect(() => {
        if (visible && data) {
            modalForm.resetFields();
            if (!isCreate) {
                const { nameMultiLang, descriptionMultiLang, ...rest } = data;

                // 获取语言代码并按 nameMultiLang 的 sort 值排序
                const languages = sortBy(Object.keys(nameMultiLang), lang => nameMultiLang[lang].sort);

                // 构造 multiLang 数组
                const multiLang = languages.map(language => ({
                    language,
                    name: nameMultiLang[language]?.name || '',
                    description: descriptionMultiLang[language]?.name || '',
                }));

                modalForm.setFieldsValue({
                    ...rest,
                    multiLang,
                });
            }
        }
    }, [ data, isCreate, isHomeLand, modalForm, visible ]);
    const handleSubmit = useCallback(async () => {
        try {
            setLoading(true);
            const { multiLang: _multiLang, sort } = await modalForm.validateFields();
            const boardId = data!.boardId;
            const multiLang = keyBy(_multiLang, 'language');
            const languages = map(_multiLang, 'language');
            const query = {
                boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1],
            };
            const nameMultiLang = languages.reduce((prev, cur, currentIndex) => {
                prev[cur] = { name: multiLang[cur].name, sort: currentIndex };
                return prev;
            }, {});
            const descriptionMultiLang = languages.reduce((prev, cur, currentIndex) => {
                prev[cur] = { name: multiLang[cur].description, sort: currentIndex };
                return prev;
            }, {});
            const params = {
                name: isHomeLand ? multiLang['zh-CN'].name : multiLang['en-US'].name,
                description: isHomeLand ? multiLang['zh-CN'].description : multiLang['en-US'].description,
                sort,
                nameMultiLang,
                descriptionMultiLang,
            };
            const { code, msg } = await (isCreate
                ? createBadgeCategory(query, params, clubDeployVersion)
                : updateBadgeCategory(query, { id: data.id, ...params }, clubDeployVersion));
            setLoading(false);
            if (code === 0) {
                message.success(`${isCreate ? '新建' : '编辑'}成功`);
                onOk();
                onClose();
            } else {
                message.error(msg);
            }
        } catch (formError) {
            const { errorFields } = formError as any;
            if (errorFields) {
                const errorItem = errorFields.find((item: any) => (item?.name || []).includes('multiLang'));
                const key = get(errorItem, 'name[1]', '');
                const values = modalForm.getFieldValue('multiLang');
                if (isNumber(key)) {
                    setActiveKey(values[key].language);
                }
                setTimeout(() => {
                    const errorFieldName = errorFields[0].name[0];
                    // 使用 form.scrollToField 方法跳转到错误字段的位置
                    modalForm.scrollToField(errorFieldName);
                }, 20);
                if (!isHomeLand) {
                    message.error('表单校验失败，请检查！');
                }
            }
        } finally {
            setLoading(false);
        }
    }, [ clubDeployVersion, data, isCreate, isHomeLand, modalForm, onClose, onOk ]);

    return useMemo(
        () => (
            <Drawer
                width={700}
                title={(isCreate ? '新增' : '编辑') + '徽章'}
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
                        multiLang: isHomeLand
                            ? [ { language: 'zh-CN', name: '', description: '' } ]
                            : [
                                  { language: 'en-US', name: '', description: '' },
                                  { language: 'zh-CN', name: '', description: '' },
                              ],
                    }}
                >
                    <Form.List name="multiLang">
                        {(fields, { add, remove }) => {
                            return (
                                <Tabs
                                    activeKey={activeKey}
                                    onTabClick={setActiveKey}
                                    {...(isHomeLand
                                        ? { type: 'card' }
                                        : { type: 'editable-card', addIcon: <div>+添加语种</div> })}
                                    onEdit={(key, action: 'add' | 'remove') => {
                                        const multiLang: MultiLang[] = modalForm.getFieldValue('multiLang');

                                        if (action === 'add') {
                                            const ref = React.createRef<{
                                                form: FormInstance;
                                            }>();
                                            const options = languageOptions.map(v => ({
                                                ...v,
                                                disabled: multiLang.some(k => k.language === v.value),
                                            }));
                                            Modal.confirm({
                                                icon: null,
                                                title: '添加语种',
                                                content: <LangSelectModal options={options} ref={ref} />,
                                                async onOk() {
                                                    const { language } =
                                                        (await ref.current?.form.validateFields()) ?? {};
                                                    for (let i = 0; i < language.length; i++) {
                                                        const languageItem = language[i];
                                                        add({ language: languageItem });
                                                    }
                                                },
                                            });
                                        } else {
                                            remove(multiLang.findIndex(v => v.language === key));
                                        }
                                    }}
                                >
                                    {fields.map((field: { name: number }) => (
                                        <Tabs.TabPane
                                            closable={![ 0, 1 ].includes(field.name)}
                                            forceRender
                                            tab={
                                                langMap[modalForm.getFieldValue([ 'multiLang', field.name, 'language' ])]
                                            }
                                            key={modalForm.getFieldValue([ 'multiLang', field.name, 'language' ])}
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
                                                label="分类名称"
                                                name={[ field.name, 'name' ]}
                                                required
                                                rules={[ { required: true, message: '不能为空' }, inputEmojiRule ]}
                                            >
                                                <Input
                                                    className="q1-form-item-xl"
                                                    placeholder="请输入徽章分类"
                                                    maxLength={50}
                                                />
                                            </Form.Item>
                                            <Form.Item
                                                label="备注"
                                                name={[ field.name, 'description' ]}
                                                rules={[ inputEmojiRule ]}
                                            >
                                                <Input
                                                    className="q1-form-item-xl"
                                                    placeholder="请输入徽章描述"
                                                    maxLength={50}
                                                />
                                            </Form.Item>
                                        </Tabs.TabPane>
                                    ))}
                                </Tabs>
                            );
                        }}
                    </Form.List>
                    <Form.Item label="排序" name="sort" required rules={[ { required: true, message: '不能为空' } ]}>
                        <InputNumber
                            className="q1-form-item-xl"
                            placeholder="请输入排序"
                            min={1}
                            max={99}
                            precision={0}
                        />
                    </Form.Item>
                </Form>
            </Drawer>
        ),
        [
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
const LangSelectModal = React.forwardRef((props: LangSelectModalProps, ref) => {
    const { options } = props;
    const [ form ] = Form.useForm();
    React.useImperativeHandle(ref, () => ({
        form,
    }));
    return (
        <Form form={form}>
            <Form.Item required rules={[ { required: true, message: '请选择' } ]} label="语种" name="language">
                <Select options={options} mode="multiple" placeholder="请选择一个语种" />
            </Form.Item>
        </Form>
    );
});
