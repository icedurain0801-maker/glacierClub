import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { inject, observer } from 'mobx-react';
import { Input, Select, Button, message, Modal, TreeSelect } from 'antd';
import { FilterBox, Q1Table, ColumnsType, Q1TablePropsType } from 'q1-antd';
import { get, groupBy, keyBy, uniq } from 'lodash';
import classNames from 'classnames';

import Permissions from '@/layouts/components/permissions';
import { StoreType } from '@/store/config';
import DateShortItem from '@/components/DateShortItem';
import { useTableAdaptHeight } from '@/utils/tableAdapt';
import {
    getGarbagePostList,
    getGarbageCommentList,
    garbageCommentRestore,
    garbagePostRestore,
    getSectionByBoard,
} from '@/api/club';
import { useContentDialogContainer, useReactive } from '@/context';
import { usePremitClubBoard } from '@/pages/club/board/hooks/useClubBoardOptions';
import placeholderVote from '@/assets/placeholder_vote.png';

import { FeedbackResponseType2 } from '@ts/api';
import { OMIT_TABLE_HEIGHT } from '@ts/clientModel';
import { paginationType } from '@ts/common';
import {
    COMMENT_FILTER,
    RecycleBinListItem,
    PASSPORT_FILTER,
    POST_FILTER,
    MomentFilterOptionsData,
    IdNameOptionsType,
    SectionResponse,
    MOMENT_TYPE,
    MomentTypeConstant,
    BOARD_PERMIT_SEPARATE,
    RICH_TEXT_TYPE_ENUM,
} from '@ts/club';

import { TABLE_TYPE } from '../list';
import PostContent from '../../components/PostContent';
import PostDetail from '../../components/PostDetail';
import { sectionsS2C } from '../../post/components/TableList';

import './tableList.less';

const defaultPagination: paginationType = {
    pageIndex: 1,
    pageSize: 10,
};

interface Sorter {
    sortField: string;
    sortOrder: string;
}

interface TableListProps {
    tableType: TABLE_TYPE;
}
interface MobxTableListProps
    extends TableListProps,
        Pick<StoreType, 'UIState' | 'Permit' | 'Game' | 'GameContext' | 'User'> {}

// 评论列表
const TableList: React.FC<TableListProps> = function TableList(props: TableListProps) {
    const { tableType, UIState } = props as MobxTableListProps;

    const { clubBoardOptions } = usePremitClubBoard();
    const [ clubDeployVersion, setclubDeployVersion ] = useState(get(clubBoardOptions, '0.value'));
    const [ loading, setLoading ] = useState(false);
    const [ currentPagination, setCurrentPagination ] = useState(defaultPagination); // 分页
    const tableEl = useRef<HTMLDivElement>(null);
    const getTableHeight = useTableAdaptHeight(tableEl, OMIT_TABLE_HEIGHT);
    const [ tableData, setTableData ] = useState<FeedbackResponseType2<RecycleBinListItem[]>>(
        {} as FeedbackResponseType2<RecycleBinListItem[]>
    );
    // 帖子详情
    const [ detailVisiable, setDetailVisiable ] = useState(false);
    const [ selectData, setSelectData ] = useState<any>();
    const handleShowDetail = useCallback(record => {
        setSelectData(record);
        setDetailVisiable(true);
    }, []);

    // form 表单查询
    const [ initialValues, setInitialValues ] = useState({
        commentFilterType: COMMENT_FILTER.ID,
        postFilterType: POST_FILTER.ID,
        passportFilterType: PASSPORT_FILTER.ID,
        boardId: get(clubBoardOptions, '0.children.0.value'),
    });

    // 排序
    const [ sorter, setSorter ] = useState<Sorter>({
        sortField: 'deleteTime',
        sortOrder: 'desc',
    });

    const [ selectedRow, setselectedRow ] = useState<RecycleBinListItem[]>([]);
    const [ sectionOptions, setSectionOptions ] = useState<IdNameOptionsType[]>([]);
    const [ sectionDict, setSectionDict ] = useState<{ [key: string]: SectionResponse[] }>({});

    // 筛选
    const filterers = FilterBox.useFilterBox();

    // 多选配置
    const rowSelection = useMemo(() => {
        return {
            selectedRowKeys: selectedRow.map(x => x.id),
            columnWidth: 50,
            onChange: (key: React.Key[], selectedRow: RecycleBinListItem[]) => {
                setselectedRow(selectedRow);
            },
        };
    }, [ selectedRow ]);
    // 获取栏目
    const fetchSectionList = useCallback(
        async val => {
            try {
                const { data = [] } = await getSectionByBoard(
                    { boardId: val.split(BOARD_PERMIT_SEPARATE)[1] },
                    clubDeployVersion
                );
                if (data?.length) {
                    let parentIdDict = groupBy(data, 'parentId') || {};
                    let dataDict = keyBy(data, 'id');
                    let nameDict: any = {};
                    data.forEach(item => {
                        nameDict[item.id] =
                            item.parentId !== 0 ? `${dataDict[item.parentId].name}-${item.name}` : item.name;
                    });
                    setSectionDict(parentIdDict);
                    setSectionOptions(sectionsS2C(data.filter(x => x.type !== MOMENT_TYPE.Image)));
                }
            } catch (e) {
                console.log(e);
            }
        },
        [ clubDeployVersion ]
    );
    useEffect(() => {
        fetchSectionList(get(clubBoardOptions, '0.children.0.value'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ fetchSectionList ]);

    // 请求table数据
    useEffect(() => {
        fetchTableData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ currentPagination.pageIndex, currentPagination.pageSize, sorter ]);

    useReactive(() => {
        fetchTableData();
    });

    // 获取table数据
    const fetchTableData = useCallback(async () => {
        try {
            setLoading(true);
            const {
                postFilterType,
                boardId: boardIdOrg,
                sectionId: sectionIdOrg,
                commentFilterType,
                passportFilterType,
                ...values
            } = await filterers.validate();
            if ([ null, undefined ].includes(boardIdOrg)) {
                message.warning('请选择所属版块');
                return false;
            }
            const [ clubDeploy, boardId ] = boardIdOrg.split(BOARD_PERMIT_SEPARATE);
            let query = { boardId: [ boardId ].join(',') };
            let sectionId = sectionIdOrg ? [ sectionIdOrg, ...(sectionDict[sectionIdOrg]?.map(x => x.id) || []) ] : null;

            const params: any = {
                ...values,
                sectionId,
                id: values.id ? Number(values.id) : undefined,
                ...sorter,
                ...currentPagination,
            };
            let res: any = {};
            if (tableType === TABLE_TYPE.POST) {
                res = await getGarbagePostList(query, params, clubDeploy);
            } else {
                res = await getGarbageCommentList(query, params, clubDeploy);
            }
            let { data, total } = res;
            setTableData({ data, total });
        } catch (e) {
            console.log(e);
        } finally {
            setLoading(false);
        }
    }, [ currentPagination, filterers, sectionDict, sorter, tableType ]);

    // 查询
    function fetchTableDataByFilter() {
        setCurrentPagination(prev => {
            if (prev.pageIndex === currentPagination.pageIndex && prev.pageSize === currentPagination.pageSize) {
                fetchTableData();
            }
            return {
                pageIndex: 1,
                pageSize: prev.pageSize,
            };
        });
    }

    // 分页
    function handleChange(nextPagination: any, filters: any, sorter: any) {
        setCurrentPagination({
            pageIndex: nextPagination.current,
            pageSize: nextPagination.pageSize || defaultPagination.pageSize,
        });
        if (sorter?.['field'] && sorter?.['order']) {
            const { field, order } = sorter;
            setSorter({
                sortField: field,
                sortOrder: order === 'ascend' ? 'asc' : 'desc',
            });
        }
    }

    const getContainer = useContentDialogContainer();
    // 确认删除
    const handleBatchRevert = useCallback(() => {
        Modal.confirm({
            getContainer,
            title: '批量恢复',
            content: (
                <div>
                    <p className="recycleBin__delete__text">
                        <span>恢复</span>
                        <span style={{ color: '#1890ff' }}>{selectedRow.length}</span>
                        <span>个</span>
                        <span>{tableType === TABLE_TYPE.POST ? '帖子' : '评论'}</span>
                        <span>吗</span>？
                    </p>
                </div>
            ),
            onOk: async () => {
                let res: any;
                let query = { boardId: uniq(selectedRow.map(x => x.boardId)).join(',') };
                let data = selectedRow?.map(x => x.id);
                if (tableType === TABLE_TYPE.POST) {
                    res = await garbagePostRestore(query, data, clubDeployVersion);
                } else {
                    res = await garbageCommentRestore(query, data, clubDeployVersion);
                }

                if (res.code === 0) {
                    fetchTableData();
                    message.success('恢复成功');
                    fetchTableData();
                } else {
                    message.error(res.message || '异常错误');
                }
            },
            onCancel: () => {},
        });
    }, [ clubDeployVersion, fetchTableData, getContainer, selectedRow, tableType ]);
    const tableTypeTitle = useMemo(() => {
        return tableType === TABLE_TYPE.POST ? '发布' : '评论';
    }, [ tableType ]);

    const redirctToVoteDetail = useCallback(
        row => {
            UIState.gotoTab({
                pathname: `/game/club/content/vote/${row.id}`,
                search: `?boardId=${row.boardId}&postId=${row.id}&topic=${row?.topic}`,
            });
        },
        [ UIState ]
    );

    // 表格数据
    const tableProps: Q1TablePropsType<RecycleBinListItem> = useMemo(() => {
        const tableTools = (
            <>
                <Permissions value="btn__update__club__recycleBin__restore" name="批量恢复">
                    <Button type="primary" onClick={handleBatchRevert} disabled={!selectedRow.length}>
                        批量恢复
                    </Button>
                </Permissions>
            </>
        );
        const columnCommon: ColumnsType<RecycleBinListItem> = [
            {
                title: '所属版块',
                dataIndex: 'boardName',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
            },
            {
                title: '所属栏目',
                dataIndex: 'sectionName',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
                width: 166,
            },
            {
                title: `${tableTypeTitle}人昵称`,
                dataIndex: 'nickName',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
            },
            {
                title: `${tableTypeTitle}人冰川通行证ID`,
                dataIndex: 'userId',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
            },
            {
                title: `${tableTypeTitle}人冰川通行证名称`,
                dataIndex: 'userName',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
            },
            {
                title: `${tableTypeTitle}时间`,
                dataIndex: 'createTime',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
                render: (v: string) => (v ? <DateShortItem formatShort="YYYY-MM-DD HH:mm:ss" date={v} /> : ''),
            },
            {
                title: '删除人',
                dataIndex: 'deleteBy',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
            },
            {
                title: '删除时间',
                dataIndex: 'deleteTime',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
                sorter: true,
                render: (v: string) => {
                    return <DateShortItem formatShort="YYYY-MM-DD HH:mm:ss" date={v} />;
                },
            },
        ];

        const columns1: ColumnsType<RecycleBinListItem> = [
            {
                title: '帖子ID',
                dataIndex: 'id',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
            },
            {
                title: '帖子标题',
                dataIndex: 'title',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
                render: (v, record) => {
                    const { topic, content } = record;
                    let showVoteIcon = false;
                    if (content) {
                        const parseContent = JSON.parse(content);
                        if (Array.isArray(parseContent)) {
                            showVoteIcon = parseContent.find(item => item.Type === RICH_TEXT_TYPE_ENUM.Vote);
                        }
                    }
                    return (
                        <span
                            className="btn-link"
                            onClick={() => {
                                handleShowDetail(record);
                            }}
                        >
                            {v || '-'}
                            {showVoteIcon && (
                                <div
                                    className={classNames({ 'q1-link': tableType === TABLE_TYPE.POST })}
                                    onClick={e => {
                                        if (tableType !== TABLE_TYPE.POST) {
                                            return;
                                        }
                                        e.preventDefault();
                                        e.stopPropagation();
                                        redirctToVoteDetail(record);
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                                        <img src={placeholderVote} width={24} alt="" />
                                        <span style={{ marginLeft: 4 }}>{topic}</span>
                                    </div>
                                </div>
                            )}
                        </span>
                    );
                },
            },
            {
                title: '帖子内容',
                dataIndex: 'content',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
                render: (v: string, row: any) => <PostContent {...row} />,
            },
            {
                title: '投稿类型',
                dataIndex: 'type',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
                render: (v: MOMENT_TYPE) => MomentTypeConstant[v],
            },
            ...columnCommon,
        ];

        const columns2: ColumnsType<RecycleBinListItem> = [
            {
                title: '评论ID',
                dataIndex: 'id',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
            },
            {
                title: '评论内容',
                dataIndex: 'content',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
                width: 300,
                render: (v: string, row: any) => <PostContent {...row} showOriginImage={true} />,
            },
            {
                title: '帖子标题',
                dataIndex: 'title',
                switch: 1,
                disabledSwitch: true,
                align: 'left',
                width: 300,
                render: v => v || '-',
            },
            ...columnCommon,
        ];

        return {
            columns: tableType === TABLE_TYPE.POST ? columns1 : columns2,
            dataSource: tableData.data,
            rowKey: 'id',
            tableName: `operation@page__club_content_recycleBin@${tableType}`,
            loading,
            tableTools,
            scrollToFirstRowOnChange: true,
            pagination: {
                showSizeChanger: true,
                current: currentPagination.pageIndex,
                pageSize: currentPagination.pageSize,
                total: tableData.total,
                showQuickJumper: true,
                showTotal: () => `共${tableData.total}条`,
            },
            onChange: handleChange,
            rowSelection: {
                type: 'checkbox',
                ...rowSelection,
            },
        };
    }, [
        handleBatchRevert,
        selectedRow.length,
        tableTypeTitle,
        tableType,
        tableData.data,
        tableData.total,
        loading,
        currentPagination.pageIndex,
        currentPagination.pageSize,
        rowSelection,
        handleShowDetail,
        redirctToVoteDetail,
    ]);

    const handleChangeBoardId = useCallback(
        async val => {
            const [ clubDeploy ] = val.split(BOARD_PERMIT_SEPARATE);
            const filter = await filterers.validate();
            fetchSectionList(val);
            setInitialValues({ ...filter, sectionId: null } as any);
            setclubDeployVersion(clubDeploy);
            fetchTableData();
        },
        [ fetchSectionList, fetchTableData, filterers ]
    );
    return (
        <>
            <FilterBox
                context={filterers}
                query={fetchTableDataByFilter}
                tableName="clubCommentTable"
                showAdvancedFilter={false}
                initialValues={initialValues}
                key={JSON.stringify(initialValues)} // 为了刷新form
                onValuesChange={(v, vs) => {
                    console.log(v, vs);
                }}
            >
                <FilterBox.Item name="boardId" label="所属版块" rules={[ { message: '请选择', required: true } ]}>
                    <Select onChange={handleChangeBoardId}>
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
                <FilterBox.Item name="sectionId" label="所属栏目">
                    <TreeSelect
                        placeholder="所有栏目"
                        allowClear
                        showSearch
                        treeDefaultExpandAll
                        treeData={sectionOptions}
                    />
                </FilterBox.Item>
                {tableType === TABLE_TYPE.POST ? (
                    <FilterBox.Item name="type" label="投稿类型">
                        <Select options={MomentFilterOptionsData} allowClear placeholder="所有类型"></Select>
                    </FilterBox.Item>
                ) : null}
                <FilterBox.Item className="filterbox-compact-model" type="compactNormal">
                    <Input.Group compact>
                        {/* 帖子 */}
                        {tableType === TABLE_TYPE.POST ? (
                            <>
                                <FilterBox.Item name="postFilterType" noStyle>
                                    <Select>
                                        <Select.Option value={POST_FILTER.ID}>帖子ID</Select.Option>
                                        <Select.Option value={POST_FILTER.TITLE}>帖子标题</Select.Option>
                                    </Select>
                                </FilterBox.Item>
                                <FilterBox.Item
                                    noStyle
                                    shouldUpdate={(prev, next) => prev.postFilterType !== next.postFilterType}
                                >
                                    {({ getFieldValue }) => {
                                        return getFieldValue('postFilterType') === POST_FILTER.ID ? (
                                            <FilterBox.Item name="id" noStyle normalize={val => val.replace(/\D/g, '')}>
                                                <Input placeholder="请输入id" style={{ width: 250 }} allowClear />
                                            </FilterBox.Item>
                                        ) : (
                                            <FilterBox.Item name="title" noStyle>
                                                <Input placeholder="请输入" style={{ width: 250 }} allowClear />
                                            </FilterBox.Item>
                                        );
                                    }}
                                </FilterBox.Item>
                            </>
                        ) : (
                            <>
                                <FilterBox.Item name="commentFilterType" noStyle>
                                    <Select>
                                        <Select.Option value={COMMENT_FILTER.ID}>评论ID</Select.Option>
                                        <Select.Option value={COMMENT_FILTER.TITLE}>评论内容</Select.Option>
                                    </Select>
                                </FilterBox.Item>
                                <FilterBox.Item
                                    noStyle
                                    shouldUpdate={(prev, next) => prev.commentFilterType !== next.commentFilterType}
                                >
                                    {({ getFieldValue }) => {
                                        return getFieldValue('commentFilterType') === COMMENT_FILTER.ID ? (
                                            <FilterBox.Item name="id" noStyle normalize={val => val.replace(/\D/g, '')}>
                                                <Input placeholder="请输入" style={{ width: 250 }} allowClear />
                                            </FilterBox.Item>
                                        ) : (
                                            <FilterBox.Item name="content" noStyle>
                                                <Input placeholder="请输入" style={{ width: 250 }} allowClear />
                                            </FilterBox.Item>
                                        );
                                    }}
                                </FilterBox.Item>
                            </>
                        )}
                    </Input.Group>
                </FilterBox.Item>

                <FilterBox.Item className="filterbox-compact-model" type="compactNormal">
                    <Input.Group compact>
                        <FilterBox.Item name="passportFilterType" noStyle>
                            <Select>
                                <Select.Option
                                    value={PASSPORT_FILTER.ID}
                                >{`${tableTypeTitle}人冰川通行证ID`}</Select.Option>
                                <Select.Option
                                    value={PASSPORT_FILTER.TITLE}
                                >{`${tableTypeTitle}人冰川通行证名称`}</Select.Option>
                                <Select.Option
                                    value={PASSPORT_FILTER.NICKNAME}
                                >{`${tableTypeTitle}人昵称`}</Select.Option>
                            </Select>
                        </FilterBox.Item>
                        <FilterBox.Item
                            noStyle
                            shouldUpdate={(prev, next) => prev.passportFilterType !== next.passportFilterType}
                        >
                            {({ getFieldValue }) => {
                                return getFieldValue('passportFilterType') === PASSPORT_FILTER.ID ? (
                                    <FilterBox.Item name="passportID" noStyle>
                                        <Input placeholder="请输入" style={{ width: 250 }} allowClear />
                                    </FilterBox.Item>
                                ) : getFieldValue('passportFilterType') === PASSPORT_FILTER.TITLE ? (
                                    <FilterBox.Item name="passportName" noStyle>
                                        <Input placeholder="请输入" style={{ width: 250 }} allowClear />
                                    </FilterBox.Item>
                                ) : (
                                    <FilterBox.Item name="nickName" noStyle>
                                        <Input placeholder="请输入" style={{ width: 250 }} allowClear />
                                    </FilterBox.Item>
                                );
                            }}
                        </FilterBox.Item>
                    </Input.Group>
                </FilterBox.Item>
            </FilterBox>

            <div ref={tableEl}>
                <Q1Table {...tableProps} scroll={{ y: getTableHeight }} />
            </div>

            <PostDetail
                type="recycleBin"
                clubDeployVersion={clubDeployVersion}
                visible={detailVisiable}
                data={selectData}
                onClose={() => {
                    setDetailVisiable(false);
                }}
            />
        </>
    );
};

export default inject('UIState', 'Permit', 'GameContext', 'User', 'Club')(observer(TableList));
