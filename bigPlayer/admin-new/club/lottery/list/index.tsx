import { Spin, Tabs } from 'antd';
import { set } from 'lodash';
import React, { useCallback, useEffect, useState } from 'react';
import { inject, observer, useObserver } from 'mobx-react';

import { useContentTab, useReactive, useStore } from '@/context';
import { StoreType } from '@/store/config';

import { LotteryRecordOptionsData } from '@ts/club';

import TableList from './components/TableList';

interface LotteryListAllProps {}
export enum TABLE_TYPE {
    /** 抽奖列表 */
    Lottery = 'Lottery',
    /** 审核列表 */
    Audit = 'Audit',
}
interface LotteryListBaseProps {}
interface LotteryListBasePropsMobx extends LotteryListBaseProps, Pick<StoreType, 'UIState'> {}
declare global {
    namespace TabberType {
        export interface State {
            activeRouteKey?: TABLE_TYPE | string;
        }
    }
}

const LotteryList = function (props: LotteryListBaseProps) {
    const { UIState } = props as LotteryListBasePropsMobx;
    const tab = useContentTab();
    // 获取缓存在路由上的state数据，用于不同路由页面间的传值，类似于地址查询串过来再删除，
    // 因为useLiveContentTabSearch无法正常监听非use...设置的值
    const activeRouteKey = useObserver(() => tab.state?.activeRouteKey ?? false);

    const [ activeKey, setActiveKey ] = useState<TABLE_TYPE>(TABLE_TYPE.Lottery);
    const [ activeTime, setActiveTime ] = useState({
        [TABLE_TYPE.Lottery]: Date.now(),
        [TABLE_TYPE.Audit]: Date.now(),
    });

    const handleTabClick = useCallback(
        (key: string) => {
            setActiveTime(set(activeTime, key, Date.now()));
            setActiveKey((key as unknown) as TABLE_TYPE);
        },
        [ activeTime ]
    );
    const queryActive = useCallback(() => {
        if (activeRouteKey) {
            setActiveKey(TABLE_TYPE.Audit);
            UIState.updateTab({
                pathname: '/game/club/lottery/list',
                state: { activeRouteKey: '' },
            });
        }
    }, [ UIState, activeRouteKey ]);
    useEffect(() => {
        queryActive();
    }, [ queryActive ]);
    useReactive(() => {
        queryActive();
    });

    return (
        <div className="lottery-list-page">
            <Tabs activeKey={activeKey} className="page-content-tabbox" onTabClick={handleTabClick} animated={false}>
                <Tabs.TabPane tab="抽奖列表" key={TABLE_TYPE.Lottery}>
                    <TableList
                        tableType={TABLE_TYPE.Lottery}
                        statusOptions={LotteryRecordOptionsData}
                        activeTime={activeTime[TABLE_TYPE.Lottery]}
                    />
                </Tabs.TabPane>
                <Tabs.TabPane tab="审核列表" key={TABLE_TYPE.Audit}>
                    <TableList
                        tableType={TABLE_TYPE.Audit}
                        statusOptions={[]}
                        activeTime={activeTime[TABLE_TYPE.Audit]}
                    />
                </Tabs.TabPane>
            </Tabs>
        </div>
    );
};
const LotteryListBase = inject('UIState')(observer(LotteryList));

// 高阶组件，boardList有值才渲染
export default function RecycleListAll(props: LotteryListAllProps) {
    const { Club } = useStore();
    const isLoaded = useObserver(() => Club.isLoaded);
    return isLoaded ? (
        <LotteryListBase {...props} />
    ) : (
        <Spin size="large">
            <div style={{ height: '100vh' }}></div>
        </Spin>
    );
}
