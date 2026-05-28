import React, { useState, useCallback } from 'react';
import { Spin, Tabs } from 'antd';
import { useObserver } from 'mobx-react';

import { StoreType } from '@/store/config';
import { useStore } from '@/context';

import TableList from './components/TableList';

export type TABLE_KEY = 'post' | 'comment';

export interface RecycleListAllProps {}
export interface MobxRecycleListAllProps extends RecycleListAllProps, Pick<StoreType, 'UIState'> {}

export enum TABLE_TYPE {
    POST = 'post',
    COMMENT = 'comment',
}

const RecycleListAllBase = function RecycleListAllBase(props: RecycleListAllProps) {
    // 初始tabPane
    const [ activeKey, setActiveKey ] = useState<TABLE_TYPE>(TABLE_TYPE.POST);

    const handleTabClick = useCallback((key: string) => {
        setActiveKey((key as unknown) as TABLE_TYPE);
    }, []);

    return (
        <>
            <Tabs
                activeKey={activeKey}
                className="page-content-tabbox club-recycleBin-list"
                onTabClick={handleTabClick}
                animated={false}
            >
                <Tabs.TabPane tab="帖子回收站" key={TABLE_TYPE.POST}>
                    <TableList tableType={TABLE_TYPE.POST} />
                </Tabs.TabPane>
                <Tabs.TabPane tab="评论回收站" key={TABLE_TYPE.COMMENT}>
                    <TableList tableType={TABLE_TYPE.COMMENT} />
                </Tabs.TabPane>
            </Tabs>
        </>
    );
};

// 高阶组件，boardList有值才渲染
export default function CommentListAll(props: RecycleListAllProps) {
    const { Club } = useStore();
    const isLoaded = useObserver(() => Club.isLoaded);
    return !isLoaded ? (
        <Spin size="large">
            <div style={{ height: '100vh' }}></div>
        </Spin>
    ) : (
        <RecycleListAllBase {...props} />
    );
}
