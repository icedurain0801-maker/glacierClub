import React, { useState, useCallback, useEffect } from 'react';
import { Spin, Tabs } from 'antd';
import { inject, observer, useObserver } from 'mobx-react';

import { useContentTabSearch, useReactive, useStore } from '@/context';
import { removeUrlQuery } from '@/utils/urlQuery';

import { PediaAuditOptionsData, PediaRecordOptionsData } from '@ts/club';

import TableList from './components/TableList';

interface BannerListAllProps {}
interface BannerListBaseProps {}

export enum TABLE_TYPE {
    /** 攻略列表 */
    Record = 'Record',
    /** 审核列表 */
    Audit = 'Audit',
}
export const TableTypeValues = [ TABLE_TYPE.Record, TABLE_TYPE.Audit ] as const;

function EncyclopediaListFn(props: BannerListBaseProps) {
    // 初始tabPane
    const [ activeKey, setActiveKey ] = useState<TABLE_TYPE>(TABLE_TYPE.Record);

    const auditRef = React.useRef<any>();
    const recordRef = React.useRef<any>();

    const urlTableType = (useContentTabSearch().get('tableType') || '') as TABLE_TYPE;

    useEffect(() => {
        TableTypeValues.includes(urlTableType) && setActiveKey(urlTableType);
    }, [ urlTableType ]);

    useReactive(() => {
        TableTypeValues.includes(urlTableType) && setActiveKey(urlTableType);
    });
    const handleTabClick = useCallback((key: string) => {
        removeUrlQuery('searchType');
        setActiveKey(key as TABLE_TYPE);
        setTimeout(() => {
            if (key === TABLE_TYPE.Record) {
                recordRef.current?.fetchTableData();
            } else {
                auditRef.current?.fetchTableData();
            }
        }, 10);
    }, []);

    return (
        <>
            <Tabs activeKey={activeKey} className="page-content-tabbox" onTabClick={handleTabClick} animated={false}>
                <Tabs.TabPane tab="攻略列表" key={TABLE_TYPE.Record}>
                    <TableList
                        key={TABLE_TYPE.Record}
                        statusOptions={PediaRecordOptionsData}
                        tableType={TABLE_TYPE.Record}
                        ref={recordRef}
                        onTabChange={handleTabClick}
                    />
                </Tabs.TabPane>
                <Tabs.TabPane tab="审核列表" key={TABLE_TYPE.Audit}>
                    <TableList
                        key={TABLE_TYPE.Audit}
                        statusOptions={PediaAuditOptionsData}
                        tableType={TABLE_TYPE.Audit}
                        ref={auditRef}
                        onTabChange={handleTabClick}
                    />
                </Tabs.TabPane>
            </Tabs>
        </>
    );
}

const EncyclopediaListBase = inject('UIState')(observer(EncyclopediaListFn));

// 高阶组件，boardList有值才渲染
export default function RecycleListAll(props: BannerListAllProps) {
    const { Club } = useStore();
    const isLoaded = useObserver(() => Club.isLoaded);
    return isLoaded ? (
        <EncyclopediaListBase {...props} />
    ) : (
        <Spin size="large">
            <div style={{ height: '100vh' }}></div>
        </Spin>
    );
}
