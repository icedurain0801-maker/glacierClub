import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Drawer, DrawerProps } from 'antd';
import { ColumnsType, Q1Table } from 'q1-antd';

import { getLikeListHref, getlikeList } from '@/api/club';
import { simpleTime } from '@/utils/date';
import { useContentPermissionFn } from '@/context';

import { paginationType } from '@ts/common';
import { CLUB_DEPLOY_VERSION, LikeListItem } from '@ts/club';

interface PostLikeProps extends DrawerProps {
    postId: number;
    boardId: number | string;
    clubDeployVersion: CLUB_DEPLOY_VERSION;
}

const defaultPagination: paginationType = {
    pageIndex: 1,
    pageSize: 10,
};

function PostLike(props: PostLikeProps) {
    const { visible, postId, boardId, clubDeployVersion, ...reset } = props;

    const { hasFunctionPermit } = useContentPermissionFn();

    const [ loading, setLoading ] = useState(false);
    const [ tableData, setTableData ] = useState<{
        data: LikeListItem[];
        total: number;
    }>({
        data: [],
        total: 0,
    });

    // 分页
    const currentPagination = useRef(defaultPagination); // 分页
    // 获取表格数据
    const fetchTableData = useCallback(async () => {
        setLoading(true);
        try {
            const { data, total = 0 } = await getlikeList(
                {
                    postId,
                    boardId,
                    ...currentPagination.current,
                },
                clubDeployVersion
            );
            if (data) {
                setTableData({
                    data,
                    total,
                });
            } else {
                setTableData({
                    data: [],
                    total: 0,
                });
            }
        } finally {
            setLoading(false);
        }
    }, [ boardId, clubDeployVersion, postId ]);

    useEffect(() => {
        if (visible && postId) {
            fetchTableData();
        }
    }, [ fetchTableData, postId, visible ]);

    const handleChange = useCallback(
        (nextPagination: any, _filters, sorter: any) => {
            currentPagination.current = {
                pageIndex: nextPagination.current,
                pageSize: nextPagination.pageSize || defaultPagination.pageSize,
            };
            fetchTableData();
        },
        [ fetchTableData ]
    );

    const columns: ColumnsType<LikeListItem> = useMemo(() => {
        return [
            {
                dataIndex: 'id',
                title: '序号',
                switch: 1,
                align: 'center',
            },
            {
                dataIndex: 'userId',
                title: '用户ID',
                switch: 1,
                align: 'center',
            },
            {
                dataIndex: 'nickName',
                title: '用户昵称',
                switch: 1,
                align: 'center',
            },
            {
                dataIndex: 'channelUserId',
                title: '冰川/渠道账号ID',
                switch: 1,
                align: 'center',
            },
            {
                dataIndex: 'userName',
                title: '冰川通行证名称',
                switch: 1,
                align: 'center',
            },
            {
                dataIndex: 'createTime',
                title: '点赞时间',
                switch: 1,
                align: 'center',
                render: v => (v ? simpleTime(v) : ''),
            },
            {
                dataIndex: 'ip',
                title: 'IP',
                switch: 1,
                align: 'center',
            },
        ];
    }, []);

    const download = useCallback(async () => {
        const params = {
            postId,
            boardId,
            pageIndex: 1,
            pageSize: 10e4,
        };
        await getLikeListHref(params, clubDeployVersion);
    }, [ boardId, clubDeployVersion, postId ]);

    return (
        <Drawer title="点赞详情" visible={visible} width={780} {...reset}>
            <Q1Table
                key="postLikeTable"
                tableName="operation@page__post__like_detail"
                loading={loading}
                rowKey="id"
                columns={columns}
                dataSource={tableData.data}
                download={hasFunctionPermit('btn__down__club_post_like') && download}
                pagination={{
                    showSizeChanger: true,
                    showQuickJumper: true,
                    ...currentPagination.current,
                    current: currentPagination.current.pageIndex,
                    total: tableData.total,
                    showTotal: () => `共${tableData.total}条`,
                }}
                onChange={handleChange}
            />
        </Drawer>
    );
}

export default PostLike;
