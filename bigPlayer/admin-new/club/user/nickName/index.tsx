import React, { useState, useCallback, useMemo } from 'react';
import { Spin, Tabs } from 'antd';
import { get } from 'lodash';
import { inject, observer } from 'mobx-react';

import { StoreType } from '@/store/config';

import { ActiveKeyType, PostAuditOptions, recordAndCancleStatusOptionsData } from '@ts/club';

import AvatarList from './components/TableList';

export interface PostListAllProps {}
interface PropsStoreType extends PostListAllProps, Pick<StoreType, 'Club'> {}

const PostListAll = function (props: PostListAllProps) {
    const {
        Club: { boardFlat, isLoaded },
    } = props as PropsStoreType;

    // 页面内使用的这个是仅用于判断是否有权限操作
    const clubBoard = useMemo(() => {
        return get(boardFlat, '0.id');
    }, [ boardFlat ]);
    // 初始tabPane
    const [ activeKey, setActiveKey ] = useState<ActiveKeyType>('audit');

    const handleTabClick = useCallback((key: string) => {
        setActiveKey((key as unknown) as ActiveKeyType);
    }, []);

    return isLoaded ? (
        <>
            <Tabs
                activeKey={activeKey}
                className="page-content-tabbox club-post-list"
                onTabClick={handleTabClick}
                animated={false}
            >
                <Tabs.TabPane tab="审核列表" key="audit">
                    <AvatarList activeKey={activeKey} statusOptions={PostAuditOptions} clubBoard={clubBoard} />
                </Tabs.TabPane>
                <Tabs.TabPane tab="昵称列表" key="record">
                    <AvatarList
                        activeKey={activeKey}
                        statusOptions={recordAndCancleStatusOptionsData}
                        clubBoard={clubBoard}
                    />
                </Tabs.TabPane>
            </Tabs>
        </>
    ) : (
        <Spin size="large">
            <div style={{ height: '100vh' }}></div>
        </Spin>
    );
};
export default inject('Club')(observer(PostListAll));
