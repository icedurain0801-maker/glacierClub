import React, { useState, useCallback } from 'react';
import { Spin, Tabs } from 'antd';
import { useObserver } from 'mobx-react';

import { StoreType } from '@/store/config';
import { useStore } from '@/context';

import TableList from './components/TableList';

export interface PostListAllProps {}
export interface MobxPostListAllProps extends PostListAllProps, Pick<StoreType, 'UIState'> {}

// 列表类型
export enum TABLE_TYPE {
    Record = 'record',
    Audit = 'audit',
}

const PostListAllBase = function PostListAllBase(props: PostListAllProps) {
    // 初始tabPane
    const [ activeKey, setActiveKey ] = useState<TABLE_TYPE>(TABLE_TYPE.Audit);

    const handleTabClick = useCallback((key: string) => {
        setActiveKey(key as TABLE_TYPE);
    }, []);

    return (
        <>
            <Tabs
                activeKey={activeKey}
                className="page-content-tabbox club-post-list"
                onTabClick={handleTabClick}
                animated={false}
                destroyInactiveTabPane={true}
            >
                <Tabs.TabPane tab="审核列表" key={TABLE_TYPE.Audit}>
                    <TableList tableType={TABLE_TYPE.Audit} />
                </Tabs.TabPane>
                <Tabs.TabPane tab="申请列表" key={TABLE_TYPE.Record}>
                    <TableList tableType={TABLE_TYPE.Record} />
                </Tabs.TabPane>
            </Tabs>
        </>
    );
};

export default function CommentListAll(props: PostListAllProps) {
    const { Club } = useStore();
    const isLoaded = useObserver(() => Club.isLoaded);
    return !isLoaded ? (
        <Spin size="large">
            <div style={{ height: '100vh' }}></div>
        </Spin>
    ) : (
        <PostListAllBase {...props} />
    );
}
