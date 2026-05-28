import React, { useCallback, useMemo } from 'react';
import { Descriptions, Table, Image, Drawer, DrawerProps, Tabs } from 'antd';
import { get } from 'lodash';

import { simpleTime } from '@/utils/date';
import { isEmpty } from '@/utils/helper';

import {
    PediaListResponse,
    SectionChildren,
    PediaShowTypeConstants,
    PediaTypeConstants,
    PEDIA_TYPE,
    PEDIA_SHOW_TYPE,
    CLUB_DEPLOY_VERSION,
    CLUB_ENVIRONMENT_ENUM,
    MultiLangColumnsItem,
    MultiLangToolColumnsItem,
} from '@ts/club';
require('./detail.less');

interface Props extends DrawerProps {
    data: PediaListResponse | null;
    langMap?: { [k in string]: string };
    clubDeployVersion?: CLUB_DEPLOY_VERSION;
}

function Detail(props: Props) {
    const { visible, data: _data, langMap, clubDeployVersion, ...reset } = props;

    const isHomeLand = useMemo(() => clubDeployVersion === CLUB_ENVIRONMENT_ENUM.ZH, [ clubDeployVersion ]);

    const data = useMemo(() => {
        return {
            ..._data,
            ...(_data
                ? {
                      columns: (_data.columns || []).map((item, index) => ({
                          ...item,
                          id: index,
                          children: item.children.map((child, idx) => ({
                              ...child,
                              id: idx,
                          })),
                      })),
                      toolColumns: (_data.toolColumns || []).map((item, index) => ({
                          ...item,
                          id: index,
                      })),
                  }
                : {}),
        };
    }, [ _data ]);

    const renderSection = useCallback(
        (dataSource: SectionChildren[]) => {
            return (
                <Table
                    bordered
                    size="small"
                    dataSource={dataSource}
                    pagination={false}
                    rowKey="id"
                    columns={[
                        ...(data?.type !== PEDIA_TYPE.Post
                            ? [
                                  {
                                      key: 'name',
                                      dataIndex: 'name',
                                      title: '名称',
                                      width: 100,
                                      ellipsis: true,
                                  },
                                  {
                                      key: 'pic',
                                      dataIndex: 'pic',
                                      title: '图片',
                                      width: 80,
                                      render: (v: string) => {
                                          return (
                                              <Image
                                                  src={v}
                                                  style={{ maxWidth: '60px', maxHeight: '60px', width: 'auto' }}
                                              />
                                          );
                                      },
                                  },
                                  {
                                      key: 'link',
                                      title: '链接',
                                      dataIndex: 'link',
                                  },
                              ]
                            : [
                                  {
                                      key: 'postTitle',
                                      title: '帖文',
                                      dataIndex: 'postTitle',
                                  },
                              ]),
                    ]}
                ></Table>
            );
        },
        [ data?.type ]
    );

    // 海外版块：按语种 normalize 数据源
    const overseaTabs = useMemo(() => {
        if (isHomeLand || !_data) {
            return [];
        }
        const isToolbox = _data.type === PEDIA_TYPE.Toolbox;
        const rawMap = isToolbox ? _data.multiLangToolColumns : _data.multiLangColumns;
        // 兼容历史数据：multiLangColumns / multiLangToolColumns 为空时，把根级 columns/toolColumns 兜底成 en-US
        const sourceMap: { [k: string]: MultiLangColumnsItem | MultiLangToolColumnsItem } =
            rawMap && Object.keys(rawMap).length
                ? rawMap
                : {
                      'en-US': {
                          sort: 0,
                          name: _data.name ?? '',
                          columns: isToolbox ? _data.toolColumns ?? [] : _data.columns ?? [],
                      } as MultiLangColumnsItem | MultiLangToolColumnsItem,
                  };
        const langs = Object.keys(sourceMap).sort((a, b) => (sourceMap[a]?.sort ?? 0) - (sourceMap[b]?.sort ?? 0));
        const decorate = (cols: any[]) =>
            (cols || []).map((item, index) => ({
                ...item,
                id: index,
                children: (item.children || []).map((c: any, idx: number) => ({ ...c, id: idx })),
            }));
        return langs.map(lang => ({
            lang,
            name: sourceMap[lang]?.name ?? '',
            decorated: decorate(sourceMap[lang]?.columns ?? []),
        }));
    }, [ _data, isHomeLand ]);

    return (
        <Drawer
            {...reset}
            width={680}
            title="攻略详情"
            visible={visible}
            className="detail-drawer-wrap pedia-detail-drawer"
        >
            <Descriptions column={1} bordered size="small">
                {isHomeLand && (
                    <Descriptions.Item label="攻略名称" labelStyle={{ width: '5em' }}>
                        {data?.name}
                    </Descriptions.Item>
                )}
                <Descriptions.Item label="模块类型" labelStyle={{ width: '5em' }}>
                    {!isEmpty(data?.type) ? PediaTypeConstants[get(data, 'type') as PEDIA_TYPE] : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="展示方式" labelStyle={{ width: '5em' }}>
                    {!isEmpty(data?.showType) ? PediaShowTypeConstants[get(data, 'showType') as PEDIA_SHOW_TYPE] : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="申请时间" labelStyle={{ width: '5em' }}>
                    {simpleTime(data?.createTime)}
                </Descriptions.Item>
            </Descriptions>

            {isHomeLand ? (
                <>
                    {(data?.type !== PEDIA_TYPE.Toolbox && data?.columns ? data.columns : []).map(
                        (item, idx: number) => {
                            return (
                                <div key={item.id}>
                                    <div className="detail-sub-title">{`栏目${idx + 1}：${item.name}`}</div>
                                    {renderSection(item.children)}
                                </div>
                            );
                        }
                    )}
                    {data?.type === PEDIA_TYPE.Toolbox && data?.toolColumns ? (
                        <div>
                            <div className="detail-sub-title">工具栏目</div>
                            {renderSection(data.toolColumns)}
                        </div>
                    ) : null}
                </>
            ) : (
                <Tabs type="card" style={{ marginTop: 12 }}>
                    {overseaTabs.map(({ lang, name, decorated }) => (
                        <Tabs.TabPane key={lang} tab={langMap?.[lang] ?? lang}>
                            <Descriptions column={1} bordered size="small" style={{ marginBottom: 12 }}>
                                <Descriptions.Item label="攻略名称" labelStyle={{ width: '5em' }}>
                                    {name}
                                </Descriptions.Item>
                            </Descriptions>
                            {data?.type !== PEDIA_TYPE.Toolbox ? (
                                decorated.map((item: any, idx: number) => (
                                    <div key={item.id}>
                                        <div className="detail-sub-title">{`栏目${idx + 1}：${item.name}`}</div>
                                        {renderSection(item.children)}
                                    </div>
                                ))
                            ) : (
                                <div>
                                    <div className="detail-sub-title">工具栏目</div>
                                    {renderSection(decorated)}
                                </div>
                            )}
                        </Tabs.TabPane>
                    ))}
                </Tabs>
            )}
        </Drawer>
    );
}

export default Detail;
