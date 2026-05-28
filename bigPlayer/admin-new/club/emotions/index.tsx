import React, { useState, useCallback, useEffect } from 'react';
import { Spin, Tabs } from 'antd';
import { inject, observer, useObserver } from 'mobx-react';
import { set } from 'lodash';

import { useContentTabSearch, useReactive, useStore } from '@/context';
import { StoreType } from '@/store/config';

import TableList from './components/TableList';

interface BannerListAllProps {}
interface EmotionListBaseProps {}
interface EmotionListBasePropsMobx extends EmotionListBaseProps, Pick<StoreType, 'UIState'> {}

export enum TABLE_TYPE {
    /** 表情包列表 */
    Record = 'Record',
    /** 审核列表 */
    Audit = 'Audit',
}
export const TableTypeValues = [ TABLE_TYPE.Record, TABLE_TYPE.Audit ] as const;

function EmotionListFn(props: EmotionListBaseProps) {
    const { UIState } = props as EmotionListBasePropsMobx;
    // 初始tabPane
    const [ activeKey, setActiveKey ] = useState<TABLE_TYPE>(TABLE_TYPE.Record);
    const [ activeTime, setActiveTime ] = useState({
        [TABLE_TYPE.Record]: Date.now(),
        [TABLE_TYPE.Audit]: Date.now(),
    });

    const urlTableType = (useContentTabSearch().get('tableType') || '') as TABLE_TYPE;

    useEffect(() => {
        TableTypeValues.includes(urlTableType) && setActiveKey(urlTableType);
    }, [ urlTableType ]);

    useReactive(() => {
        TableTypeValues.includes(urlTableType) && setActiveKey(urlTableType);
    });
    const handleTabClick = useCallback(
        (key: string) => {
            setActiveTime(set(activeTime, key, Date.now()));
            setActiveKey((key as unknown) as TABLE_TYPE);
            UIState.gotoTab({
                pathname: `/game/club/emoticons/list`,
                search: `?tableType=${key}`,
            });
        },
        [ UIState, activeTime ]
    );

    return (
        <>
            <Tabs activeKey={activeKey} className="page-content-tabbox" onTabClick={handleTabClick} animated={false}>
                <Tabs.TabPane tab="表情包列表" key={TABLE_TYPE.Record}>
                    <TableList tableType={TABLE_TYPE.Record} activeTime={activeTime[TABLE_TYPE.Record]} />
                </Tabs.TabPane>
                <Tabs.TabPane tab="审核列表" key={TABLE_TYPE.Audit}>
                    <TableList tableType={TABLE_TYPE.Audit} activeTime={activeTime[TABLE_TYPE.Audit]} />
                </Tabs.TabPane>
            </Tabs>
        </>
    );
}

const EmotionsListBase = inject('UIState')(observer(EmotionListFn));

// 高阶组件，boardList有值才渲染
export default function EmotionListAll(props: BannerListAllProps) {
    const { Club } = useStore();
    const isLoaded = useObserver(() => Club.isLoaded);
    return isLoaded ? (
        <EmotionsListBase {...props} />
    ) : (
        <Spin size="large">
            <div style={{ height: '100vh' }}></div>
        </Spin>
    );
}
