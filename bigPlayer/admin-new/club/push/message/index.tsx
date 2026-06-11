import React, { useState, useCallback, useEffect } from 'react';
import { Spin, Tabs } from 'antd';
import { inject, observer, useObserver } from 'mobx-react';

import { useContentTabSearch, useReactive, useStore } from '@/context';
import { removeUrlQuery } from '@/utils/urlQuery';
import { StoreType } from '@/store/config';

const MessageAuditOptions = [{ label: '全部', value: '' }, { label: '待审核', value: 0 }, { label: '已通过', value: 1 }];
const MessageRecordOptions = [{ label: '全部', value: '' }, { label: '正常', value: 1 }];

import TableList from './components/TableList';

interface PushMessageListProps {}
interface PushMessageListFnProps {}
interface PushMessageListFnPropsMobx extends PushMessageListFnProps, Pick<StoreType, 'UIState'> {}

export enum TABLE_TYPE {
    /** 推送列表 */
    Record = 'Record',
    /** 审核列表 */
    Audit = 'Audit',
}
export const TableTypeValues = [ TABLE_TYPE.Record, TABLE_TYPE.Audit ] as const;

function PushMessageListFn(props: PushMessageListFnProps) {
    const { UIState } = props as PushMessageListFnPropsMobx;
    // 初始tabPane
    const [ activeKey, setActiveKey ] = useState<TABLE_TYPE>(TABLE_TYPE.Record);

    const auditRef = React.useRef<any>();
    const recordRef = React.useRef<any>();

    const urlTableType = (useContentTabSearch().get('tableType') || '') as TABLE_TYPE;

    useEffect(() => {
        TableTypeValues.includes(urlTableType) && setActiveKey(urlTableType);
    }, [ urlTableType ]);

    useReactive(() => {
        if (TableTypeValues.includes(urlTableType)) {
            setActiveKey(urlTableType);
            if (urlTableType === TABLE_TYPE.Record) {
                recordRef.current?.fetchTableData();
            } else {
                auditRef.current?.fetchTableData();
            }
        }
    });

    const handleTabClick = useCallback(
        (key: string) => {
            removeUrlQuery('searchType');
            setActiveKey(key as TABLE_TYPE);
            UIState.gotoTab({
                pathname: `/game/club/push/list`,
                search: `?tableType=${key}`,
            });
            setTimeout(() => {
                if (urlTableType === TABLE_TYPE.Record) {
                    recordRef.current?.fetchTableData();
                } else {
                    auditRef.current?.fetchTableData();
                }
            }, 10);
        },
        [ UIState, urlTableType ]
    );

    return (
        <>
            <Tabs activeKey={activeKey} className="page-content-tabbox" onTabClick={handleTabClick} animated={false}>
                <Tabs.TabPane tab="消息列表" key={TABLE_TYPE.Record}>
                    <TableList
                        key={TABLE_TYPE.Record}
                        statusOptions={MessageRecordOptions}
                        tableType={TABLE_TYPE.Record}
                        ref={recordRef}
                        onTabChange={handleTabClick}
                    />
                </Tabs.TabPane>
                <Tabs.TabPane tab="审核列表" key={TABLE_TYPE.Audit}>
                    <TableList
                        key={TABLE_TYPE.Audit}
                        statusOptions={MessageAuditOptions}
                        tableType={TABLE_TYPE.Audit}
                        ref={auditRef}
                        onTabChange={handleTabClick}
                    />
                </Tabs.TabPane>
            </Tabs>
        </>
    );
}

const PushMessageListBase = inject('UIState')(observer(PushMessageListFn));

// 高阶组件，boardList有值才渲染
export default function PushMessageList(props: PushMessageListProps) {
    const { Club } = useStore();
    const isLoaded = useObserver(() => Club.isLoaded);
    return isLoaded ? (
        <PushMessageListBase {...props} />
    ) : (
        <Spin size="large">
            <div style={{ height: '100vh' }}></div>
        </Spin>
    );
}
