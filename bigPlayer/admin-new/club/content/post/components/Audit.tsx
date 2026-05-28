import { Button, Divider, Form, Input, Modal, Radio, Select, message } from 'antd';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { keyBy, uniq } from 'lodash';
import { PlusOutlined } from '@ant-design/icons';

import { useContentDialogContainer } from '@/context';
import { addPostAuditRemark, getPostAuditRemark, postBatchAudit, updatePostAuditRemark } from '@/api/club';
import EditLine, { EditLineContext } from '@/components/editLine';

import { AUDIT_STATUS, CLUB_DEPLOY_VERSION, CLUB_REMARK_ENUM, PostListItem } from '@ts/club';
import { EnabledOptions, IS_ENABLE } from '@ts/enum/enum';

interface PostAuditProps {
    visible: boolean;
    selectedRows: PostListItem[];
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    onSuccess: () => void;
    oncancel: () => void;
}

const layout = {
    labelCol: { span: 6 },
    wrapperCol: { span: 18 },
};

interface Option {
    label: string;
    value: number | string;
}

const REMARK_LENGTH_MAX = 50; // 备注最大字数
const type = CLUB_REMARK_ENUM.POST;

function PostAudit(props: PostAuditProps) {
    const { visible, selectedRows, clubDeployVersion, onSuccess, oncancel } = props;

    const [ batchAuditForm ] = Form.useForm();
    const [ batchAuditLoading, setBatchAuditLoading ] = useState(false);

    const getUuid = () => uuidv4();

    const commonQuery = useMemo(() => {
        return {
            boardId: uniq(selectedRows.map(x => x.boardId)).join(','),
        };
    }, [ selectedRows ]);

    // 确认批量审核
    const handleBatchAuditConfirm = async () => {
        const { isEnable, remark, remarkId, ...rest } = await batchAuditForm.validateFields();
        const submitData = {
            ...rest,
            ...(isEnable === IS_ENABLE.Enable
                ? {
                      remark: remarkOptionsDict[remarkId]?.label,
                  }
                : {
                      remark,
                  }),
            ids: selectedRows?.map(x => x.id),
        };

        setBatchAuditLoading(true);
        try {
            let query = { ...commonQuery, code: getUuid() };
            const res = await postBatchAudit(query, submitData, clubDeployVersion);
            if (res.code === 0) {
                message.success('审核成功');
                batchAuditForm.resetFields();
                onSuccess();
            } else {
                message.error(res?.msg || '异常错误');
            }
        } catch (e) {
            message.error('批量审核失败！');
        } finally {
            setBatchAuditLoading(false);
        }
    };

    const handleConcel = useCallback(() => {
        oncancel();
        batchAuditForm.resetFields();
    }, [ batchAuditForm, oncancel ]);

    const [ remarkOptions, setRemarkOptions ] = useState<Option[]>([]);
    const [ remarkValue, setRemarkValue ] = useState('');
    const [ remarkSelectOpen, setRemarkSelectOpen ] = useState(false);
    const remarkEditLineContextValue = useMemo(() => ({ active: remarkSelectOpen }), [ remarkSelectOpen ]);

    const remarkOptionsDict = useMemo(() => {
        return keyBy(remarkOptions, 'value');
    }, [ remarkOptions ]);

    const getRemarkOptions = useCallback(async () => {
        const params = { ...commonQuery, type, pageIndex: 1, pageSize: 9999 };
        const { code, data } = await getPostAuditRemark(params, clubDeployVersion);
        if (code === 0 && data) {
            const options = data.map(item => ({ label: item.content, value: item.id }));
            setRemarkOptions(options);
        } else {
            setRemarkOptions([]);
        }
    }, [ clubDeployVersion, commonQuery ]);

    useEffect(() => {
        if (visible) {
            getRemarkOptions();
        }
    }, [ getRemarkOptions, visible ]);

    const openRemarkSelectDropDown = useCallback(() => {
        setRemarkSelectOpen(true);
    }, []);

    const closeRemarkSelectDropDown = useCallback(() => {
        setRemarkSelectOpen(false);
    }, []);

    const onAddValue = useCallback(
        async value => {
            if (value === '') {
                message.error('请输入');
                return;
            }
            const { code, msg } = await addPostAuditRemark(commonQuery, { content: value, type }, clubDeployVersion);
            if (code === 0) {
                message.success('添加成功');
                setRemarkValue('');
                getRemarkOptions();
            } else {
                message.error(msg || '添加失败');
            }
        },
        [ clubDeployVersion, commonQuery, getRemarkOptions ]
    );

    const handleRowChange = useCallback(
        async (newVal, oldVal) => {
            const params = {
                id: oldVal,
                content: newVal,
                type,
            };
            const { code, msg } = await updatePostAuditRemark(commonQuery, params, clubDeployVersion);
            if (code === 0) {
                message.success('编辑成功');
                getRemarkOptions();
            } else {
                message.error(msg || '编辑失败');
            }
        },
        [ clubDeployVersion, commonQuery, getRemarkOptions ]
    );

    // const handleRowDelete = useCallback(
    //     async value => {
    //         const { code, message: msg } = await removePostAuditRemark(commonQuery, { id: value }, clubDeployVersion);
    //         if (code === 0) {
    //             message.success('删除成功');
    //             getRemarkOptions();
    //             const fromValue = batchAuditForm.getFieldValue('remark');
    //             if (value === fromValue) {
    //                 batchAuditForm.setFields([
    //                     {
    //                         name: 'remark',
    //                         value: '',
    //                     },
    //                 ]);
    //             }
    //         } else {
    //             message.error(msg || '删除失败');
    //         }
    //     },
    //     [ batchAuditForm, clubDeployVersion, commonQuery, getRemarkOptions ]
    // );

    return (
        <Modal
            getContainer={useContentDialogContainer()}
            title="批量审核"
            visible={visible}
            onCancel={handleConcel}
            footer={
                <div
                    style={{
                        textAlign: 'right',
                    }}
                >
                    <Button onClick={handleConcel} style={{ marginRight: 8 }}>
                        取消
                    </Button>
                    <Button
                        loading={batchAuditLoading}
                        onClick={() => {
                            handleBatchAuditConfirm();
                        }}
                        type="primary"
                    >
                        确定
                    </Button>
                </div>
            }
        >
            <div>
                <p className="batch-audit-tip">
                    <span>共审核</span>
                    <span className="color-blue">{selectedRows.length}</span>
                    <span>个帖子</span>
                </p>
                <Form
                    {...layout}
                    name="batchAuditForm"
                    form={batchAuditForm}
                    initialValues={{ status: AUDIT_STATUS.Passed, isEnable: IS_ENABLE.Enable }}
                >
                    <Form.Item name="status" label="审核" required>
                        <Radio.Group>
                            <Radio value={AUDIT_STATUS.Passed}>全部通过</Radio>
                            <Radio value={AUDIT_STATUS.Rejected}>全部拒绝</Radio>
                        </Radio.Group>
                    </Form.Item>
                    <Form.Item name="isEnable" label="审核备注模板" required>
                        <Radio.Group options={EnabledOptions}></Radio.Group>
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(prev, next) => prev.isEnable !== next.isEnable}>
                        {({ getFieldValue }) => {
                            const isEnable = getFieldValue('isEnable');
                            if (isEnable) {
                                return (
                                    <Form.Item
                                        name="remarkId"
                                        label="备注"
                                        required
                                        rules={[ { required: true, message: '请选择备注' } ]}
                                    >
                                        <Select
                                            className="input-width"
                                            placeholder="请选择备注"
                                            showSearch
                                            optionFilterProp="children"
                                            optionLabelProp="label"
                                            dropdownRender={menu => (
                                                <div>
                                                    <EditLineContext.Provider value={remarkEditLineContextValue}>
                                                        {menu}
                                                        <Divider style={{ margin: '4px 0' }} />
                                                        <div
                                                            style={{ display: 'flex', flexWrap: 'nowrap', padding: 8 }}
                                                        >
                                                            <Input
                                                                allowClear
                                                                maxLength={REMARK_LENGTH_MAX}
                                                                style={{ flex: 'auto' }}
                                                                value={remarkValue}
                                                                onChange={e => {
                                                                    setRemarkValue(e.target.value);
                                                                }}
                                                            />
                                                            <div
                                                                style={{
                                                                    flex: 'none',
                                                                    padding: '8px',
                                                                    display: 'block',
                                                                    cursor: 'pointer',
                                                                }}
                                                                onClick={() => onAddValue(remarkValue)}
                                                            >
                                                                <PlusOutlined /> 添加
                                                            </div>
                                                        </div>
                                                    </EditLineContext.Provider>
                                                </div>
                                            )}
                                            open={remarkSelectOpen}
                                            onDropdownVisibleChange={v => {
                                                if (v) {
                                                    openRemarkSelectDropDown();
                                                } else {
                                                    closeRemarkSelectDropDown();
                                                }
                                            }}
                                            onFocus={openRemarkSelectDropDown}
                                        >
                                            {remarkOptions?.map(item => (
                                                <Select.Option key={item.value} value={item.value} label={item.label}>
                                                    <EditLine
                                                        btnVisible={{
                                                            edit: true,
                                                            remove: false,
                                                            copy: false,
                                                        }}
                                                        value={item.label}
                                                        onChange={v => {
                                                            handleRowChange(v, item.value);
                                                        }}
                                                        key={item.value}
                                                    />
                                                </Select.Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                );
                            } else {
                                return (
                                    <Form.Item
                                        name="remark"
                                        label="审核备注"
                                        rules={[
                                            {
                                                required: true,
                                                message: '请填写审核备注！',
                                                transform: v => v && v.trim(),
                                            },
                                        ]}
                                    >
                                        <Input.TextArea
                                            placeholder={`仅输入${REMARK_LENGTH_MAX}个汉字`}
                                            maxLength={REMARK_LENGTH_MAX}
                                        />
                                    </Form.Item>
                                );
                            }
                        }}
                    </Form.Item>
                </Form>
                <p>提示：仅支持全部通过或全部拒绝，且只能审核机器初审过的任务，如想查看详情，请逐条查看</p>
            </div>
        </Modal>
    );
}

export default PostAudit;
