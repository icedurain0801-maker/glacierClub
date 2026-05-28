import React, { useState, useCallback, useMemo } from 'react';
import { Spin, Tabs } from 'antd';
import { inject, observer } from 'mobx-react';
import { get } from 'lodash';

import { StoreType } from '@/store/config';

import { ActiveKeyType, recordAndCancleStatusOptionsData, PostAuditOptions } from '@ts/club';

import AvatarList from './components/AvatarList';

export interface PostListAllProps {}
interface PropsStoreType extends PostListAllProps, Pick<StoreType, 'Club'> {}

const PostListAll = function (props: PostListAllProps) {
    const {
        Club: { boardFlat, isLoaded },
    } = props as PropsStoreType;
    // 初始tabPane
    const [ activeKey, setActiveKey ] = useState<ActiveKeyType>('audit');

    const handleTabClick = useCallback((key: string) => {
        setActiveKey((key as unknown) as ActiveKeyType);
    }, []);

    const clubBoard = useMemo(() => {
        return get(boardFlat, '0.id');
    }, [ boardFlat ]);

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
                <Tabs.TabPane tab="头像列表" key="record">
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
