import { Button, Descriptions, Drawer, Form, Tag } from 'antd';
import type { DrawerProps } from 'antd/es/drawer';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ColumnsType, Q1Table } from 'q1-antd';

import { useContentPermissionFn } from '@/context';
import { getUserExperience, getUserExperienceHref } from '@/api/club';
import useSyncState from '@/components/UseSyncState';
import { quickPickTimeRange, setUtcFormat, simpleTime } from '@/utils/date';
import RangePicker from '@/components/RangePicker';

import {
    ActionsKeys,
    CLUB_DEPLOY_VERSION,
    RULE_ACTION,
    UesrstatusColorConstant,
    UesrstatusConstant,
    UserExperienceItem,
    UserinfoListResponse,
} from '@ts/club';

interface IProps extends DrawerProps {
    detail: UserinfoListResponse | null;
    boardId: number;
    clubDeployVersion: CLUB_DEPLOY_VERSION;
}

function BaseDrawer(props: IProps) {
    const { visible, detail, boardId, clubDeployVersion, ...reset } = props;
    const { hasFunctionPermit } = useContentPermissionFn();

    const [ form ] = Form.useForm();

    const [ loading, setLoading ] = useState(false);

    const [ tableData, setTableData ] = useState<Array<UserExperienceItem>>([]);

    // 分页
    const [ pagination, setpagination, getPagination ] = useSyncState({
        current: 1,
        total: 0,
        pageSize: 10,
    });

    const fetchTableData = useCallback(async () => {
        setLoading(true);
        try {
            const { timeRange } = await form.validateFields();
            if (detail) {
                const { pageSize, current } = getPagination();
                const query = {
                    userInfoId: detail.userInfoId,
                    boardId,
                    ...(timeRange && timeRange.length > 0
                        ? {
                              beginTime: setUtcFormat(timeRange[0]),
                              endTime: setUtcFormat(timeRange[1]),
                          }
                        : {}),
                    pageIndex: current,
                    pageSize,
                };
                const { data = [], total = 0 } = await getUserExperience(query, clubDeployVersion);
                if ((data || [])?.length === 0 && current !== 1) {
                    setpagination({ ...getPagination(), current: 1 });
                    fetchTableData();
                }
                if (data) {
                    const _data = data.map((item, idx: number) => ({
                        ...item,
                        customKey: pageSize * (current - 1) + idx,
                    }));
                    setTableData(_data);
                    setpagination({ ...getPagination(), total });
                } else {
                    setTableData([]);
                    setpagination({ ...getPagination(), total: 0 });
                }
            }
        } finally {
            setLoading(false);
        }
    }, [ boardId, clubDeployVersion, detail, form, getPagination, setpagination ]);

    useEffect(() => {
        fetchTableData();
    }, [ fetchTableData ]);

    const columns: ColumnsType<UserExperienceItem> = useMemo(() => {
        return [
            {
                dataIndex: 'createTime',
                title: '获得时间',
                switch: 1,
                align: 'center',
                render: v => (v ? simpleTime(v) : ''),
            },
            {
                dataIndex: 'behavior',
                title: '原因',
                switch: 1,
                align: 'center',
                render: (v: RULE_ACTION) => ActionsKeys[v],
            },
            {
                dataIndex: 'exp',
                title: '获得经验值',
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

    // 导出
    const download = useCallback(async () => {
        const { timeRange } = await form.validateFields();
        if (detail) {
            const query = {
                userInfoId: detail.userInfoId,
                boardId,
                ...(timeRange && timeRange.length > 0
                    ? {
                          beginTime: setUtcFormat(timeRange[0]),
                          endTime: setUtcFormat(timeRange[1]),
                      }
                    : {}),
                pageIndex: 1,
                pageSize: 10e4,
            };
            await getUserExperienceHref(query, clubDeployVersion);
        }
    }, [ boardId, clubDeployVersion, detail, form ]);

    return (
        <Drawer visible={visible} title="用户详情" footer={null} {...reset} width={680} className="detail-drawer-wrap">
            <p className="detail-sub-title">基础信息</p>
            <Descriptions column={2} bordered labelStyle={{ width: '8em' }}>
                <Descriptions.Item label="大玩家用户ID">{detail?.userInfoId}</Descriptions.Item>
                <Descriptions.Item label="昵称">{detail?.nickName}</Descriptions.Item>
                <Descriptions.Item label="冰川/渠道账号ID">{detail?.userId}</Descriptions.Item>
                <Descriptions.Item label="状态">
                    <Tag color={UesrstatusColorConstant[detail?.status as keyof typeof UesrstatusColorConstant]}>
                        {UesrstatusConstant[detail?.status as keyof typeof UesrstatusConstant] || ''}
                    </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="是否冰川账号">{detail?.isBc ? '是' : '否'}</Descriptions.Item>
                <Descriptions.Item label="论坛币">{detail?.forumPoint}</Descriptions.Item>
                <Descriptions.Item label="经验值">{detail?.experience}</Descriptions.Item>
            </Descriptions>
            <p className="detail-sub-title">经验值获取记录</p>
            <Form form={form} labelCol={{ style: { width: '6em' } }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Form.Item name="timeRange" label="获得时间">
                        <RangePicker
                            showTime
                            placeholder={[ '开始时间', '结束时间' ]}
                            allowClear={true}
                            format="YYYY-MM-DD HH:mm:ss"
                            ranges={quickPickTimeRange}
                        />
                    </Form.Item>
                    <Button type="primary" onClick={fetchTableData}>
                        查询
                    </Button>
                </div>
            </Form>
            <Q1Table
                download={hasFunctionPermit('btn__down__club_user_exp') && download}
                key="clubUserExpTable"
                tableName="operation@page__list__club_user_detail"
                loading={loading}
                rowKey="customKey"
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
