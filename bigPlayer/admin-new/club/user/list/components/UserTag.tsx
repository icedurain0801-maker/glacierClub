import { Button, Descriptions, Drawer, Form, Input } from 'antd';
import type { DrawerProps } from 'antd/es/drawer';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ColumnsType, Q1Table } from 'q1-antd';
import { get } from 'lodash';

import { getUserTag } from '@/api/club';
import useSyncState from '@/components/UseSyncState';

import { UesrsexConstant, UserTag, UserinfoListResponse, CLUB_DEPLOY_VERSION } from '@ts/club';

interface IProps extends DrawerProps {
    detail: UserinfoListResponse | null;
    clubDeployVersion: CLUB_DEPLOY_VERSION;
}

function calculateAges(birthdate?: string): number | string {
    if (!birthdate) {
        return '';
    }
    const birthDate = new Date(birthdate);
    const today = new Date();
    const monthDifference = today.getMonth() - birthDate.getMonth();

    // 虚岁
    let virtualAge = today.getFullYear() - birthDate.getFullYear() + 1;

    // 检查是否在生日之前
    if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
        virtualAge--;
    }

    return virtualAge;
}

function BaseDrawer(props: IProps) {
    const { visible, detail, clubDeployVersion, ...reset } = props;

    const [ form ] = Form.useForm();

    const [ loading, setLoading ] = useState(false);

    const [ tableData, setTableData ] = useState<Array<UserTag>>([]);

    // 分页
    const [ pagination, setpagination, getPagination ] = useSyncState({
        current: 1,
        total: 0,
        pageSize: 10,
    });

    const fetchTableData = useCallback(async () => {
        setLoading(true);
        try {
            const { tagName } = await form.validateFields();
            if (detail) {
                const { pageSize, current } = getPagination();
                const query = {
                    userId: detail.userInfoId,
                    tagName,
                    pageIndex: current,
                    pageSize,
                };
                const { data = [], total = 0 } = await getUserTag(query, clubDeployVersion);
                if ((data || [])?.length === 0 && current !== 1) {
                    setpagination({ ...getPagination(), current: 1 });
                    fetchTableData();
                }
                if (data) {
                    setTableData(data);
                    setpagination({ ...getPagination(), total });
                } else {
                    setTableData([]);
                    setpagination({ ...getPagination(), total: 0 });
                }
            }
        } finally {
            setLoading(false);
        }
    }, [ clubDeployVersion, detail, form, getPagination, setpagination ]);

    useEffect(() => {
        fetchTableData();
    }, [ fetchTableData ]);

    const columns: ColumnsType<UserTag> = useMemo(() => {
        return [
            {
                dataIndex: 'tag',
                title: '标签名字',
                switch: 1,
                align: 'center',
            },
            {
                dataIndex: 'tagHitCount',
                title: '标签命中数',
                switch: 1,
                align: 'center',
            },
            {
                dataIndex: 'tagPoint',
                title: '关联分数',
                switch: 1,
                align: 'center',
            },
        ];
    }, []);

    const handleChange = useCallback(
        (nextPagination: any, _filters, sorter: any) => {
            setpagination({ ...pagination, ...nextPagination });
            fetchTableData();
        },
        [ fetchTableData, pagination, setpagination ]
    );

    return (
        <Drawer visible={visible} title="用户画像" footer={null} {...reset} width={680} className="detail-drawer-wrap">
            <p className="detail-sub-title">基础信息</p>
            <Descriptions column={2} bordered labelStyle={{ width: '8em' }}>
                <Descriptions.Item label="IP">{detail?.ip}</Descriptions.Item>
                <Descriptions.Item label="生日">{detail?.birthday}</Descriptions.Item>
                <Descriptions.Item label="性别">{get(UesrsexConstant, detail?.sex ?? '')}</Descriptions.Item>
                <Descriptions.Item label="年龄">{calculateAges(detail?.birthday)}</Descriptions.Item>
            </Descriptions>
            <p className="detail-sub-title">行为标签</p>
            <Form form={form} labelCol={{ style: { width: '6em' } }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Form.Item name="tagName" label="标签名字">
                        <Input className="input-width" allowClear />
                    </Form.Item>
                    <Button type="primary" onClick={fetchTableData}>
                        查询
                    </Button>
                </div>
            </Form>
            <Q1Table
                key="clubUserTagTable"
                tableName="operation@page__list__club_user_tag"
                loading={loading}
                rowKey="id"
                columns={columns}
                dataSource={tableData}
                pagination={{
                    showSizeChanger: true,
                    showQuickJumper: true,
                    ...pagination,
                    total: pagination.total,
                    showTotal: () => `共${pagination.total}条`,
                }}
                onChange={handleChange}
            ></Q1Table>
        </Drawer>
    );
}
export default BaseDrawer;
