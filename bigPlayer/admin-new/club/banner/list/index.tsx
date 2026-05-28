import React, { useState, useCallback, useEffect } from 'react';
import { Spin, Tabs } from 'antd';
import { inject, observer, useObserver } from 'mobx-react';
import { set } from 'lodash';

import { useContentTabSearch, useReactive, useStore } from '@/context';
import { StoreType } from '@/store/config';

import { BannerAuditOptionsData, BannerRecordOptionsData } from '@ts/club';

import TableList from './components/TableList';

interface BannerListAllProps {}
interface BannerListBaseProps {}
interface BannerListBasePropsMobx extends BannerListBaseProps, Pick<StoreType, 'UIState'> {}

export enum TABLE_TYPE {
    /** 轮播列表 */
    Record = 'Record',
    /** 审核列表 */
    Audit = 'Audit',
}
export const TableTypeValues = [ TABLE_TYPE.Record, TABLE_TYPE.Audit ] as const;

function BannerListFn(props: BannerListBaseProps) {
    const { UIState } = props as BannerListBasePropsMobx;
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
                pathname: `/game/club/banner/list`,
                search: `?tableType=${key}`,
            });
        },
        [ UIState, activeTime ]
    );

    return (
        <>
            <Tabs activeKey={activeKey} className="page-content-tabbox" onTabClick={handleTabClick} animated={false}>
                <Tabs.TabPane tab="轮播列表" key={TABLE_TYPE.Record}>
                    <TableList
                        tableType={TABLE_TYPE.Record}
                        statusOptions={BannerRecordOptionsData}
                        activeTime={activeTime[TABLE_TYPE.Record]}
                    />
                </Tabs.TabPane>
                <Tabs.TabPane tab="审核列表" key={TABLE_TYPE.Audit}>
                    <TableList
                        tableType={TABLE_TYPE.Audit}
                        statusOptions={BannerAuditOptionsData}
                        activeTime={activeTime[TABLE_TYPE.Audit]}
                    />
                </Tabs.TabPane>
            </Tabs>
        </>
    );
}

const BannerListBase = inject('UIState')(observer(BannerListFn));

// 高阶组件，boardList有值才渲染
export default function RecycleListAll(props: BannerListAllProps) {
    const { Club } = useStore();
    const isLoaded = useObserver(() => Club.isLoaded);
    return isLoaded ? (
        <BannerListBase {...props} />
    ) : (
        <Spin size="large">
            <div style={{ height: '100vh' }}></div>
        </Spin>
    );
}
