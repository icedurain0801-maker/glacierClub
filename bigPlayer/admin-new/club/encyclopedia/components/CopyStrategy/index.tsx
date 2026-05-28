import { Button, Form, message, Modal, Select, Space } from 'antd';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { OptionsType } from 'rc-select/lib/interface';

import { batchCopyEncyclopediaGroup } from '@/api/club';

import { CLUB_DEPLOY_VERSION, PediaListResponse } from '@ts/club';
require('./index.less');
interface PropsType {
    boardId: number;
    userName: string;
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    visible: boolean;
    setVisible: (visible: boolean) => void;
    selectData: PediaListResponse[];
    options: OptionsType;
    initOptionsDict: Record<string, { label: string; value: number }>;
}

export const CopyStrategy = function CopyStrategy(props: PropsType) {
    const {
        boardId,
        userName,
        initOptionsDict,
        options = [],
        visible,
        setVisible,
        clubDeployVersion,
        selectData,
    } = props;

    const [ form ] = Form.useForm();

    const [ loading, setLoading ] = useState(false);

    const selectOptions = useMemo(() => {
        return options
            .filter(x => x.value !== selectData[0]?.groupId)
            .map(item => ({
                label: item.label,
                value: item.value,
            }));
    }, [ options, selectData ]);

    const onOk = useCallback(async () => {
        const { targetGroupId } = await form.validateFields();

        try {
            setLoading(true);
            const { code, message: msg } = await batchCopyEncyclopediaGroup(
                boardId,
                {
                    ids: selectData.map(x => x.id),
                    targetGroupId,
                    creator: userName,
                },
                clubDeployVersion
            );
            if (code === 0) {
                message.success(msg);
                setVisible(false);
            } else {
                message.error(msg);
            }
        } catch (error) {
        } finally {
            setLoading(false);
        }
    }, [ boardId, clubDeployVersion, form, selectData, setVisible, userName ]);

    const onCancel = useCallback(() => {
        setVisible(false);
    }, [ setVisible ]);

    useEffect(() => {
        if (!visible) {
            form.resetFields();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ visible ]);

    return (
        <div className="copy-strategy-page">
            <Modal
                className="copy-strategy-page_modal"
                title="攻略站复制"
                visible={visible}
                onCancel={onCancel}
                footer={
                    <>
                        <Button onClick={onCancel} loading={loading}>
                            取消
                        </Button>
                        <Button type="primary" onClick={onOk} loading={loading}>
                            确定
                        </Button>
                    </>
                }
            >
                <Form form={form}>
                    <Form.Item colon={false} className="group-form-item">
                        <Space wrap={true} align="center" style={{ justifyContent: 'center' }}>
                            共选择<span style={{ color: '#1890ff' }}>{selectData.length}</span>个攻略站，当前攻略组为
                            <span style={{ color: '#1890ff' }}>
                                {initOptionsDict[selectData[0]?.groupId]?.label || ''}
                            </span>
                            复制至{' '}
                        </Space>

                        <Form.Item
                            colon={false}
                            noStyle
                            name="targetGroupId"
                            rules={[ { required: true, message: '请选择分组' } ]}
                        >
                            <Select
                                notFoundContent="暂无可迁移分组"
                                options={selectOptions}
                                style={{ width: 200, marginTop: 10 }}
                            />
                        </Form.Item>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};
