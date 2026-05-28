import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Button, Input, message, Modal, Popover, Select, Spin, Tag } from 'antd';
import { useObserver } from 'mobx-react';
import { ColumnsType, FilterBox, Q1Table, Q1TablePropsType } from 'q1-antd';
import { get, sortBy } from 'lodash';
import { PlusOutlined } from '@ant-design/icons';

import Permissions from '@/layouts/components/permissions';
import { useContentDialogContainer, useContentPermissionFn, useStore } from '@/context';
import { simpleTime } from '@/utils/date';
import ActionGroup from '@/components/ActionGroup';
import { useTableAdaptHeight } from '@/utils/tableAdapt';
import { getAppConfigCenterList } from '@/api/configCenter';
import { usePersistantFunction } from '@/hooks/state/useLatestValueRef';
import TableCellText from '@/components/display/Table/TableCellText';
import { getBadgeCategoryList, removeBadgeCategory } from '@/api/clubBadge';

import { DefaultPagination } from '@ts/enum/table';
import { BOARD_PERMIT_SEPARATE, CLUB_APP_ID } from '@ts/club';
import { BadgeCategoryListItem, EditBadgeCategoryData, NameMultiLangType } from '@ts/clubBadge';
import { FeedbackResponseType2 } from '@ts/api';
import { OMIT_TABLE_HEIGHT } from '@ts/clientModel';
import { TableColumnWidth } from '@ts/app';

import Create from './Create';
import { usePremitClubBoard } from '../../board/hooks/useClubBoardOptions';

export enum TABLE_TYPE {
    Record = 'Record',
    Audit = 'Audit',
}
export const TableTypeValues = [ TABLE_TYPE.Record, TABLE_TYPE.Audit ] as const;

export default function AdvanceList() {
    const { Club } = useStore();
    const isLoaded = useObserver(() => Club.isLoaded);
    return isLoaded ? (
        <BadgeCategoryList />
    ) : (
        <Spin size="large">
            <div style={{ height: '100vh' }}></div>
        </Spin>
    );
}

const MAX_LANG_TAG_SHOW_COUNT = 4;

function BadgeCategoryList() {
    const { clubBoardOptions } = usePremitClubBoard();
    const filterInit = {
        boardId: get(clubBoardOptions, '0.children.0.value'),
    };
    const { hasFunctionPermit } = useContentPermissionFn();
    const previousBoradId = useRef<string>();
    const [ initialValues, setInitialValues ] = useState(filterInit);
    const currentPaginationRef = useRef(DefaultPagination);
    const [ clubDeployVersion, setclubDeployVersion ] = useState(get(clubBoardOptions, '0.value'));
    const tableEl = useRef<HTMLDivElement>(null);
    const getTableHeight = useTableAdaptHeight(tableEl, OMIT_TABLE_HEIGHT);
    const [ tableData, setTableData ] = useState<FeedbackResponseType2<BadgeCategoryListItem[]>>(
        {} as FeedbackResponseType2<BadgeCategoryListItem[]>
    );
    const [ loading, setLoading ] = useState(false);
    const [ editVisible, setEditVisible ] = useState(false);
    const getContainer = useContentDialogContainer();
    const [ editData, setEditData ] = useState<EditBadgeCategoryData>({} as EditBadgeCategoryData);
    const filterers = FilterBox.useFilterBox();
    const [ languageOptions, setLanguageOptions ] = useState<
        Array<{
            label: string;
            value: string;
        }>
    >([]);
    const [ langMap, setLangMap ] = useState<{ [k in string]: string }>({});
    const initLanguage = useRef(false);
    const { fetchTableData } = usePersistantFunction({
        async fetchTableData() {
            try {
                setLoading(true);
                if (!initLanguage.current) {
                    const languageResponse: { language: string; code: string }[] = await getAppConfigCenterList({
                        appId: CLUB_APP_ID,
                        tableName: 'LanguageClub',
                    });
                    const languageOptions = languageResponse
                        .filter(v => v.code)
                        .map(v => ({
                            label: v.language,
                            value: v.code,
                        }));
                    const langMap = languageOptions.reduce((acc, cur) => {
                        acc[cur.value] = cur.label;
                        return acc;
                    }, {} as { [k in string]: string });
                    setLangMap(langMap);
                    setLanguageOptions(languageOptions);
                    initLanguage.current = true;
                }
                const { type, boardId, filterType, date, status, ...values } = await filterers.validate();
                const query = {
                    boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1],
                    ...values,
                    ...currentPaginationRef.current,
                };
                const { data, total } = await getBadgeCategoryList(query, clubDeployVersion);
                if (data == null) {
                    setTableData({ data: [], total: 0 });
                } else {
                    setTableData({ data, total });
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        },
    });

    useEffect(() => {
        let boardId = get(clubBoardOptions, '0.children.0.value');
        if (boardId) {
            fetchTableData();
            previousBoradId.current = boardId;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const handleFormChange = useCallback(
        async val => {
            let { boardId, ...ret } = await filterers.validate();
            if (previousBoradId.current !== boardId) {
                setclubDeployVersion(boardId.split(BOARD_PERMIT_SEPARATE)[0]);
                fetchTableData();
            }
            setInitialValues({
                boardId,
                ...ret,
            } as any);
            previousBoradId.current = boardId;
        },
        [ fetchTableData, filterers ]
    );
    const fetchTableDataByFilter = useCallback(() => {
        currentPaginationRef.current = {
            ...currentPaginationRef.current,
            pageIndex: 1,
        };
        fetchTableData();
    }, [ fetchTableData ]);
    const handleAdd = useCallback(async () => {
        const { boardId } = await filterers.validate();
        const origin = boardId.split('&&')[0];
        const id = boardId.split('&&')[1];
        setEditData({
            boardId,
            boardName: clubBoardOptions.find(v => v.value === origin)?.children.find(v => v.id.toString() === id)
                ?.label,
        } as any);
        setEditVisible(true);
    }, [ clubBoardOptions, filterers ]);
    const tableTools = useMemo(() => {
        return (
            <Permissions value="btn__add__club_badge_category">
                <Button type="primary" onClick={handleAdd}>
                    新增
                </Button>
            </Permissions>
        );
    }, [ handleAdd ]);

    const handleAddOk = useCallback(async () => {
        fetchTableData();
    }, [ fetchTableData ]);

    const handlePaginationChange = useCallback(
        nextPagination => {
            currentPaginationRef.current = {
                pageIndex: nextPagination.current,
                pageSize: nextPagination.pageSize || DefaultPagination.pageSize,
            };
            fetchTableData();
        },
        [ fetchTableData ]
    );
    const handleEdit = useCallback(
        async (record: BadgeCategoryListItem) => {
            const { boardId } = await filterers.validate();
            const origin = boardId.split('&&')[0];
            const id = boardId.split('&&')[1];
            setEditData({
                ...record,
                boardName: clubBoardOptions.find(v => v.value === origin)?.children.find(v => v.id.toString() === id)
                    ?.label,
                boardId,
            } as any);
            setEditVisible(true);
        },
        [ clubBoardOptions, filterers ]
    );
    const handleDelete = useCallback(
        (record: BadgeCategoryListItem) => {
            Modal.confirm({
                getContainer,
                content: (
                    <div>
                        <p>
                            <span>确认删除当前分类吗？</span>
                        </p>
                    </div>
                ),
                onOk: async () => {
                    const res = await removeBadgeCategory(
                        { id: record.id, boardId: record.boardId },
                        clubDeployVersion
                    );
                    if (res.code === 0) {
                        fetchTableData();
                        message.success('删除成功');
                    } else {
                        message.error(res.msg || '删除异常错误');
                    }
                },
            });
        },
        [ clubDeployVersion, fetchTableData, getContainer ]
    );
    const tableProps: Q1TablePropsType<BadgeCategoryListItem> = useMemo(() => {
        const columns: ColumnsType<BadgeCategoryListItem> = [
            {
                title: '排序',
                dataIndex: 'sort',
                width: TableColumnWidth.index,
            },
            {
                title: '分类名称',
                dataIndex: 'name',
                width: 120,
            },
            {
                title: '绑定徽章数',
                dataIndex: 'badgeCount',
                width: 120,
            },
            {
                title: '备注',
                dataIndex: 'description',
                render: v => <TableCellText data={v} />,
            },
            ...(clubDeployVersion === 'en'
                ? [
                      {
                          title: '语言',
                          dataIndex: 'nameMultiLang',
                          width: 150,
                          render: (v: NameMultiLangType) => {
                              // 按 sort 值排序语言代码
                              const sortedLangs = sortBy(Object.keys(v), lang => v[lang].sort);

                              let renderHtml: React.ReactNode = '';

                              if (sortedLangs.length > MAX_LANG_TAG_SHOW_COUNT) {
                                  renderHtml = (
                                      <Popover
                                          title="多语言详情"
                                          placement="bottom"
                                          content={
                                              <div style={{ maxHeight: '50vh', maxWidth: '1200px', overflow: 'auto' }}>
                                                  {sortedLangs.map((item, index) => (
                                                      <Tag key={index} color="blue" style={{ marginBottom: '4px' }}>
                                                          {langMap[item] || item}
                                                      </Tag>
                                                  ))}
                                              </div>
                                          }
                                      >
                                          <div>
                                              {sortedLangs.slice(0, MAX_LANG_TAG_SHOW_COUNT).map((item, index) => (
                                                  <Tag key={index} color="blue" style={{ marginBottom: '4px' }}>
                                                      {langMap[item] || item}
                                                  </Tag>
                                              ))}
                                              <Tag color="blue">
                                                  <PlusOutlined /> {sortedLangs.length - MAX_LANG_TAG_SHOW_COUNT}
                                              </Tag>
                                          </div>
                                      </Popover>
                                  );
                              } else {
                                  renderHtml = sortedLangs.map((item, index) => (
                                      <Tag key={index} color="blue" style={{ marginBottom: '4px' }}>
                                          {langMap[item] || item}
                                      </Tag>
                                  ));
                              }

                              return renderHtml;
                          },
                      },
                  ]
                : []),

            {
                title: '申请人',
                dataIndex: 'createdBy',
                width: 80,
                align: 'left',
            },
            {
                title: '申请时间',
                dataIndex: 'createdAt',
                width: 160,
                render: (v: string) => simpleTime(v),
            },
            {
                title: '操作',
                dataIndex: 'operation',
                fixed: 'right',
                width: TableColumnWidth.operationSmall,
                render: (_, record: BadgeCategoryListItem) => {
                    return (
                        <ActionGroup
                            className="operation-btn-group"
                            btns={[
                                {
                                    title: '',
                                    icon: '',
                                    hidden: !hasFunctionPermit('btn__update__club_badge_category'),
                                    props: {
                                        type: 'link',
                                        children: '编辑',
                                        onClick() {
                                            handleEdit(record);
                                        },
                                    },
                                },
                                {
                                    title: '',
                                    icon: '',
                                    props: {
                                        type: 'link',
                                        hidden:
                                            !hasFunctionPermit('btn__del__club_badge_category') ||
                                            record.badgeCount > 0,
                                        children: '删除',
                                        danger: true,
                                        onClick() {
                                            handleDelete(record);
                                        },
                                    },
                                },
                            ]}
                        ></ActionGroup>
                    );
                },
            },
        ];

        return {
            columns: columns,
            dataSource: tableData.data,
            rowKey: 'id',
            tableName: `operation@page__list__club_badge_category@v1`,
            loading,
            tableTools,
            scrollToFirstRowOnChange: true,
            pagination: {
                showSizeChanger: true,
                current: currentPaginationRef.current.pageIndex,
                pageSize: currentPaginationRef.current.pageSize,
                total: tableData.total,
                showQuickJumper: true,
                showTotal: () => `共${tableData.total}条`,
            },
            onChange: handlePaginationChange,
        };
    }, [
        clubDeployVersion,
        handleDelete,
        handleEdit,
        handlePaginationChange,
        hasFunctionPermit,
        langMap,
        loading,
        tableData.data,
        tableData.total,
        tableTools,
    ]);
    return (
        <div className="appearance-manage-page">
            <FilterBox
                context={filterers}
                query={fetchTableDataByFilter}
                tableName="clubBadgeCategoryTable"
                showAdvancedFilter={false}
                initialValues={initialValues}
            >
                <FilterBox.Item name="boardId" label="所属版块" rules={[ { message: '请选择', required: true } ]}>
                    <Select onChange={handleFormChange}>
                        {clubBoardOptions?.map(item =>
                            item?.children?.length ? (
                                <Select.OptGroup label={item.label} key={item.value}>
                                    {item.children.map(childItem => (
                                        <Select.Option value={childItem.value} key={childItem.value}>
                                            {childItem.label}
                                        </Select.Option>
                                    ))}
                                </Select.OptGroup>
                            ) : null
                        )}
                    </Select>
                </FilterBox.Item>
                <FilterBox.Item name="name" label="徽章分类">
                    <Input placeholder="名称" allowClear />
                </FilterBox.Item>
            </FilterBox>
            <div ref={tableEl}>
                <Q1Table {...tableProps} scroll={{ y: getTableHeight }} />
            </div>
            <Create
                clubBoardOptions={clubBoardOptions}
                visible={editVisible}
                data={editData}
                clubDeployVersion={clubDeployVersion}
                onClose={() => {
                    setEditVisible(false);
                }}
                onOk={handleAddOk}
                languageOptions={languageOptions}
                langMap={langMap}
            />
        </div>
    );
}
