import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { inject, observer } from 'mobx-react';
import {
    Input,
    Select,
    Button,
    message,
    Modal,
    Tag,
    TreeSelect,
    Popover,
    FormInstance,
    Space,
    Dropdown,
    Menu,
} from 'antd';
import { FilterBox, Q1Table, ColumnsType, Q1TablePropsType } from 'q1-antd';
import type { ButtonType } from 'antd/es/button';
import { get, groupBy, keyBy, omit, uniq } from 'lodash';
import moment from 'moment';
import classNames from 'classnames';
import { v4 as uuidv4 } from 'uuid';
import { DownOutlined, PlusOutlined } from '@ant-design/icons';
import { usePersistantFunction } from '@q1/hooks';

import placeholderVote from '@/assets/placeholder_vote.png';
import Permissions from '@/layouts/components/permissions';
import ActionGroup from '@/components/ActionGroup';
import { StoreType } from '@/store/config';
import { useContentDialogContainer, useContentPermissionFn } from '@/context';
import DateShortItem from '@/components/DateShortItem';
import { useTableAdaptHeight } from '@/utils/tableAdapt';
import {
    getPostListHref,
    getPostList,
    postBatchDelete,
    postToTop,
    getSectionByBoard,
    postBoutique,
    postSink,
    postLimitComment,
    postBatchMachineAudit,
    postRevoked,
    batchMigratePostSection,
    postRecommend,
    batchOperatePost,
} from '@/api/club';
import { quickPickTimeRange, setUtcEndTimeAndFormat, setUtcStartTimeAndFormat, simpleTime } from '@/utils/date';
import RangePicker from '@/components/RangePicker';
import { usePremitClubBoard } from '@/pages/club/board/hooks/useClubBoardOptions';

import { FeedbackResponseType2 } from '@ts/api';
import { OMIT_TABLE_HEIGHT } from '@ts/clientModel';
import { paginationType } from '@ts/common';
import {
    POST_FILTER,
    PostListItem,
    PostParams,
    PASSPORT_FILTER,
    AuditStatusColor,
    AuditStatusConstant,
    auditIncludsStatus,
    AUDIT_STATUS,
    DATE_TYPE,
    DATE_VALUE,
    DateTypeConstant,
    USERLABEL_FILTER_AUDIT_OPTIONS,
    USERLABEL_FILTER_RECORD_OPTIONS,
    PASSPORT_FILTER_VALUE_CONSTANT,
    RANGE_PICKER_LIST,
    MomentFilterOptionsData,
    MomentTypeConstant,
    MOMENT_TYPE,
    SectionResponse,
    IdNameOptionsType,
    BOARD_PERMIT_SEPARATE,
    RICH_TEXT_TYPE_ENUM,
    PostOperationOptions,
    PostAuditOptions,
    MAX_AUDIT_NUMS,
    MAX_MACHINE_AUDIT_NUMS,
    PostRatingConstants,
    POST_RATING,
    PostRatingOptions,
    postRecordStatusOptionsData,
    postRecordIncludsStatus,
    TopHomeRecommend,
    BatchOperateTypeOptions,
    BATCH_OPERATE_POST_TYPE,
    POST_OPERATION_STATUS,
    BatchCancelOperationStatusConstants,
    CancelPostOperationStatus,
    CancelOperationStatusMap,
    BatchOperateTypeConstants,
    UserLabelTreeType,
    POST_MARK,
    PostMarkConstants,
    PostMarkOptions,
} from '@ts/club';
import { IS_ENABLE } from '@ts/enum/enum';
import { TableColumnWidth } from '@ts/app';

import { TABLE_TYPE } from '../list';
import PostContent from '../../components/PostContent';
import PostDetail from '../../components/PostDetail';
import PostEdit, { Edit_type } from '../../components/PostEdit';
import Totop, { TOP_HOME_RECOMMEND } from '../../components/PostToTop';
import PostRating from '../../components/PostRating';
import PostMark from '../../components/PostMark';
import PostLike from '../../components/PostLike';
import PostSectionMigrateForm from '../../components/PostSectionMigrateForm';
import PostAudit from './Audit';

require('./tableList.less');

const defaultPagination: paginationType = {
    pageIndex: 1,
    pageSize: 10,
};

interface Sorter {
    sortField: string;
    sortOrder?: string;
}

export function sectionsS2C(data: SectionResponse[]) {
    let result = data;
    try {
        let sectionsDict = groupBy(data, 'parentId');
        result = sectionsDict[0]?.map(x => ({
            ...x,
            title: x.name,
            value: x.id,
            children: sectionsDict[x.id as any]?.map(child => ({
                ...child,
                title: child.name,
                value: child.id,
            })),
        }));
    } catch (e) {
        console.error('sectionsS2C error:', e);
    }
    return result;
}

// 筛选选项输入框生成器
export const transformFilterItemCom = (type: PASSPORT_FILTER, labelTypeOptions: UserLabelTreeType[]) => {
    if (type === PASSPORT_FILTER.USERLABEL) {
        return (
            <FilterBox.Item name={PASSPORT_FILTER_VALUE_CONSTANT[type]} noStyle>
                <TreeSelect
                    treeData={labelTypeOptions}
                    allowClear
                    treeDefaultExpandAll
                    placeholder="不限"
                    className="club-user-label-select"
                />
            </FilterBox.Item>
        );
    }
    return (
        <FilterBox.Item name={PASSPORT_FILTER_VALUE_CONSTANT[type]} noStyle>
            <Input placeholder="请输入" style={{ width: 250 }} allowClear />
        </FilterBox.Item>
    );
};

interface TableListProps {
    tableType: TABLE_TYPE;
}
interface MobxTableListProps
    extends TableListProps,
        Pick<StoreType, 'UIState' | 'Permit' | 'Game' | 'GameContext' | 'User' | 'Club'> {}

const defaultSort = {
    sortField: 'createTime',
    sortOrder: 'desc',
};
function searchChildSection(array: IdNameOptionsType[], childId: number) {
    for (const item of array) {
        if (item.children) {
            for (const child of item.children) {
                if (child.id === childId) {
                    return { name: `${item.name}-${child.name}`, parentId: item.id };
                }
            }
        }
    }
}

const MAX_TOPIC_TAG_SHOW_COUNT = 3;
// 帖子列表
const TableList: React.FC<TableListProps> = function TableList(props: TableListProps) {
    const {
        tableType,
        UIState,
        Club: { userLabelDictAll },
    } = props as MobxTableListProps;

    const { hasFunctionPermit } = useContentPermissionFn();
    const [ loading, setLoading ] = useState(false);
    const { clubBoardOptions } = usePremitClubBoard();
    const [ clubDeployVersion, setclubDeployVersion ] = useState(get(clubBoardOptions, '0.value'));
    // 筛选
    const filterers = FilterBox.useFilterBox();

    const [ currentPagination, setCurrentPagination ] = useState(defaultPagination); // 分页
    const tableEl = useRef<HTMLDivElement>(null);
    const getTableHeight = useTableAdaptHeight(tableEl, OMIT_TABLE_HEIGHT);
    const [ tableData, setTableData ] = useState<FeedbackResponseType2<PostListItem[]>>(
        {} as FeedbackResponseType2<PostListItem[]>
    );

    // 帖子详情
    const [ detailVisiable, setDetailVisiable ] = useState(false);
    const [ editVisiable, setEditVisiable ] = useState(false);
    const [ editType, seteditType ] = useState<Edit_type>('create');
    const [ selectData, setSelectData ] = useState<PostListItem>();
    const handleShowDetail = useCallback(record => {
        setSelectData(record);
        setDetailVisiable(true);
    }, []);

    const handleShowEdit = useCallback(
        async record => {
            seteditType(record === undefined ? 'create' : 'edit');
            if (record === undefined) {
                let { boardId, type } = await filterers.validate();
                if (!boardId || type === undefined) {
                    !boardId && message.warn('请先选择所属版块');
                    type === undefined && message.error('请先选择投稿类型');
                } else {
                    setSelectData({ boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1], type } as any);
                    setEditVisiable(true);
                }
            } else {
                setSelectData(record);
                setEditVisiable(true);
            }
        },
        [ filterers ]
    );

    // form 表单查询
    const [ initialValues, setInitialValues ] = useState({
        postFilterType: POST_FILTER.ID,
        passportFilterType: PASSPORT_FILTER.ID,
        boardId: get(clubBoardOptions, '0.children.0.value'),
        type: undefined,
    });

    // 排序
    const [ sorter, setSorter ] = useState<Sorter>(defaultSort);

    const [ selectedRow, setselectedRow ] = useState<PostListItem[]>([]);

    // 批量审核相关
    const [ batchAuditVisible, setBatchAuditVisible ] = useState(false);
    const [ sectionOptions, setSectionOptions ] = useState<IdNameOptionsType[]>([]);
    const [ sectionDict, setSectionDict ] = useState<{ [key: string]: SectionResponse[] }>({});

    // 多选配置
    const rowSelection = useMemo(() => {
        return {
            selectedRowKeys: selectedRow?.map(x => x.id),
            columnWidth: 50,
            onChange: (keys: any, selectedRow: PostListItem[]) => {
                setselectedRow(selectedRow);
            },
            getCheckboxProps: (record: PostListItem) => ({
                disabled: record.status === AUDIT_STATUS.Revoked,
            }),
        };
    }, [ selectedRow ]);

    // 置顶操作
    const [ visibleTotopModal, setVisibleTotopModal ] = useState<{
        visible: boolean;
        topRecomendType: TOP_HOME_RECOMMEND;
        isEdit: boolean;
    }>({
        visible: false,
        topRecomendType: TOP_HOME_RECOMMEND.Top,
        isEdit: false,
    });
    const [ sectionMigrateVisible, setSectionMigrateVisible ] = useState(false);

    const auditStatusArray = useMemo(() => {
        return tableType === TABLE_TYPE.Audit
            ? [ ...auditIncludsStatus, AUDIT_STATUS.MachineBatchPassed, AUDIT_STATUS.MachineBatchRejected ]
            : postRecordIncludsStatus;
    }, [ tableType ]);

    // 获取栏目
    const fetchSectionList = useCallback(async val => {
        try {
            console.log('val', val);
            const { data = [] } = await getSectionByBoard(
                { boardId: val.split(BOARD_PERMIT_SEPARATE)[1] },
                val.split(BOARD_PERMIT_SEPARATE)[0]
            );
            console.log('data', data);
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
    }, []);

    useEffect(() => {
        fetchSectionList(get(clubBoardOptions, '0.children.0.value'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ fetchSectionList ]);

    // 请求table数据
    useEffect(() => {
        fetchTableData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ currentPagination.pageIndex, currentPagination.pageSize, sorter ]);

    // 获取table数据
    const fetchTableData = useCallback(async () => {
        try {
            setLoading(true);
            const {
                boardId: boardIdOrg,
                sectionId: sectionIdOrg,
                createTime,
                auditTime,
                ratings,
                ...values
            } = await filterers.validate();
            if ([ null, undefined, '' ].includes(boardIdOrg)) {
                message.warn('请选择所属版块');
                return false;
            }
            const [ clubDeployVersion, boardId ] = boardIdOrg.split(BOARD_PERMIT_SEPARATE);
            let query = {
                boardId: [ boardId ].join(','),
            };
            let sectionId = sectionIdOrg ? [ sectionIdOrg, ...(sectionDict[sectionIdOrg]?.map(x => x.id) || []) ] : null;
            const { operationStatus } = values;
            setOperationStatus(operationStatus || null);
            const params = {
                ...omit(values, 'postFilterType', 'passportFilterType'),
                sectionId,
                status: values.status || values.status === 0 ? [ values.status ] : auditStatusArray,
                createStartTime: createTime ? setUtcStartTimeAndFormat(createTime[0]) : null,
                createEndTime: createTime ? setUtcEndTimeAndFormat(createTime[1]) : null,
                auditStartTime: auditTime ? setUtcStartTimeAndFormat(auditTime[0]) : null,
                auditEndTime: auditTime ? setUtcEndTimeAndFormat(auditTime[1]) : null,
                id: values.id ? Number(values.id) : undefined,
                ...(ratings && ratings?.length > 0
                    ? {
                          ratings,
                      }
                    : {}),
                ...sorter,
                ...currentPagination,
            } as PostParams;
            const res: FeedbackResponseType2<PostListItem[]> = await getPostList(query, params, clubDeployVersion);
            let { data, total } = res;
            setselectedRow([]);
            setTableData({ data, total });
        } catch (e) {
            console.log(e);
        } finally {
            setLoading(false);
        }
    }, [ auditStatusArray, currentPagination, filterers, sectionDict, sorter ]);

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
        } else {
            setSorter(defaultSort);
        }
    }

    // 确认删除
    const handleBatchDelete = useCallback(() => {
        Modal.confirm({
            title: '批量删除',
            content: (
                <div>
                    <p className="port__delete__text">
                        删除<span style={{ color: '#1890ff' }}>{selectedRow.length}</span>个帖子吗？
                    </p>
                    <p className="post_delete_tips">操作不可恢复，请谨慎操作！</p>
                </div>
            ),
            onOk: async () => {
                let query = { boardId: uniq(selectedRow.map(x => x.boardId)).join(',') };
                let data = selectedRow.map(x => x.id);
                const res: FeedbackResponseType2<any> = await postBatchDelete(query, data, clubDeployVersion);
                if (res.code === 0) {
                    fetchTableData();
                    message.success('删除成功');
                } else {
                    message.error(res.message || '异常错误');
                }
            },
            onCancel: () => {},
        });
    }, [ clubDeployVersion, fetchTableData, selectedRow ]);

    // 批量评级
    const [ postRatingVisible, setPostRatingVisible ] = useState(false);
    const [ postMarkVisible, setPostMarkVisible ] = useState(false);

    const getUuid = () => uuidv4();

    // 批量审核
    const openBatchAuditModal = useCallback(() => {
        if (selectedRow.length > MAX_AUDIT_NUMS) {
            message.error(`批量审核条数不能大于${MAX_AUDIT_NUMS}条！`);
            return;
        }
        setBatchAuditVisible(true);
    }, [ selectedRow.length ]);

    const [ batchMachineAuditLoading, setBatchMachineAuditLoading ] = useState(false);

    const batchMachineAudit = useCallback(async () => {
        if (selectedRow.length > MAX_MACHINE_AUDIT_NUMS) {
            message.error(`批量审核条数不能大于${MAX_MACHINE_AUDIT_NUMS}条！`);
            return;
        }
        setBatchMachineAuditLoading(true);
        try {
            let query = { boardId: uniq(selectedRow.map(x => x.boardId)).join(','), code: getUuid() };
            const submitData = {
                ids: selectedRow?.map(x => x.id),
            };
            const res = await postBatchMachineAudit(query, submitData, clubDeployVersion);
            if (res.code === 0) {
                setBatchAuditVisible(false);
                message.success(res.msg || '批量机审成功');
                setselectedRow([]);
                fetchTableData();
            } else {
                message.error(res?.msg || '异常错误');
            }
        } catch (e) {
            message.error('批量审核失败！');
        } finally {
            setBatchMachineAuditLoading(false);
        }
    }, [ clubDeployVersion, fetchTableData, selectedRow ]);

    let postOpsApiDict = useMemo(() => {
        return {
            postToTop: postToTop,
            postBoutique: postBoutique,
            postSink: postSink,
            postLimitComment: postLimitComment,
        };
    }, []);

    const getContainer = useContentDialogContainer();

    // 操作
    const handleAction = useCallback(
        (row: PostListItem, apiKey: keyof typeof postOpsApiDict, data, title: string) => {
            Modal.confirm({
                title: '系统提示',
                getContainer,
                content: (
                    <div>
                        <p>
                            <span>确定要</span>
                            <span>{title}</span>
                            <span>帖子</span>【<span className="color-blue">{row.id}</span>】？
                        </p>
                    </div>
                ),
                onOk: async () => {
                    let query = { boardId: [ row?.boardId ].join(',') };
                    const res: FeedbackResponseType2<any> = await postOpsApiDict[apiKey](
                        query,
                        data,
                        clubDeployVersion
                    );
                    if (res.code === 0) {
                        fetchTableData();
                        message.success('操作成功');
                        fetchTableData();
                    } else {
                        message.error(res.msg || '操作失败');
                    }
                },
                onCancel: () => {},
            });
        },
        [ clubDeployVersion, fetchTableData, getContainer, postOpsApiDict ]
    );
    // 导出
    const download = useCallback(async () => {
        const {
            boardId,
            sectionId: sectionIdOrg,
            createTime,
            auditTime,
            ratings,
            ...values
        } = await filterers.validate();
        if ([ null, undefined ].includes(boardId)) {
            message.warn('请选择所属版块');
            return false;
        }
        const isSearchLastWeek = Object.values(
            omit(await filterers.validate(), 'boardId', 'postFilterType', 'passportFilterType')
        ).every(v => !v);
        const query = { boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1] };
        let sectionId = sectionIdOrg ? [ sectionIdOrg, ...(sectionDict[sectionIdOrg]?.map(x => x.id) || []) ] : null;
        const params = {
            ...omit(values, 'postFilterType', 'passportFilterType'),
            sectionId,
            status: values.status || values.status === 0 ? [ values.status ] : auditStatusArray,
            createStartTime: createTime
                ? setUtcStartTimeAndFormat(createTime[0])
                : isSearchLastWeek
                ? moment().subtract(1, 'weeks').utc().format()
                : null,
            createEndTime: createTime
                ? setUtcEndTimeAndFormat(createTime[1])
                : isSearchLastWeek
                ? moment().utc().format()
                : null,
            auditStartTime: auditTime ? setUtcStartTimeAndFormat(auditTime[0]) : null,
            auditEndTime: auditTime ? setUtcEndTimeAndFormat(auditTime[1]) : null,
            id: values.id ? Number(values.id) : undefined,
            ...(ratings && ratings?.length > 0
                ? {
                      ratings,
                  }
                : {}),
            pageIndex: 1,
            pageSize: 10e4,
            tableType,
            ...sorter,
        } as PostParams;
        await getPostListHref(query, params, clubDeployVersion);
    }, [ auditStatusArray, clubDeployVersion, filterers, sectionDict, sorter, tableType ]);

    const redirctToVoteDetail = useCallback(
        row => {
            UIState.gotoTab({
                pathname: `/game/club/content/vote/${row.id}`,
                search: `?boardId=${row.boardId}&postId=${row.id}&topic=${row?.topic}&clubDeployVersion=${clubDeployVersion}`,
            });
        },
        [ UIState, clubDeployVersion ]
    );

    const handlePostRecommend = useCallback(
        (row: PostListItem, isEdit?: boolean) => {
            const cancelRecommend = row?.topHomeRecommend === 1;
            if (isEdit) {
                setSelectData(row);
                setVisibleTotopModal({
                    visible: true,
                    topRecomendType: TOP_HOME_RECOMMEND.Recommend,
                    isEdit,
                });
                return;
            }
            if (cancelRecommend) {
                Modal.confirm({
                    title: '取消首页推荐',
                    content: (
                        <span>
                            确定要将 <span className="color-blue">{row.id}</span>取消首页推荐吗？
                        </span>
                    ),
                    onOk: async () => {
                        let query = {
                            boardId: row.boardId,
                            id: row.id,
                            recommend: cancelRecommend ? 0 : 1,
                            userId: row.userId,
                            userInfoId: row.userInfoId,
                        };
                        const res: FeedbackResponseType2<any> = await postRecommend(query, clubDeployVersion);
                        if (res.code === 0) {
                            message.success('操作成功');
                            fetchTableData();
                        } else {
                            message.error(res.msg || '异常错误');
                        }
                    },
                });
            } else {
                setSelectData(row);
                setVisibleTotopModal({
                    visible: true,
                    topRecomendType: TOP_HOME_RECOMMEND.Recommend,
                    isEdit: false,
                });
            }
        },
        [ clubDeployVersion, fetchTableData ]
    );

    const handleRevokePost = useCallback(
        (row: PostListItem) => {
            Modal.confirm({
                title: '系统提示',
                getContainer,
                content: (
                    <div>
                        <p>
                            <span>确定要</span>
                            <span>撤回</span>
                            <span>帖子</span>【<span className="color-blue">{row.id}</span>】？
                        </p>
                    </div>
                ),
                onOk: async () => {
                    let query = { boardId: [ row?.boardId ].join(',') };
                    let data = { postId: row.id };
                    const res: FeedbackResponseType2<any> = await postRevoked(query, data, clubDeployVersion);
                    if (res.code === 0) {
                        message.success('撤回成功');
                        fetchTableData();
                    } else {
                        message.error(res.msg || '异常错误');
                    }
                },
                onCancel: () => {},
            });
        },
        [ clubDeployVersion, fetchTableData, getContainer ]
    );

    // 点赞详情
    const [ thumbsDetailData, setThumbsDetailData ] = useState({
        thumbsVisible: false,
        thumbsDetailId: -1,
        thumbsDetailBoardId: -1,
    });
    const onShowThumbsDetail = useCallback((row: PostListItem) => {
        if (row.thumbsUpCount > 0) {
            setThumbsDetailData({
                thumbsVisible: true,
                thumbsDetailId: row.id,
                thumbsDetailBoardId: row.boardId,
            });
        }
        return;
    }, []);
    const { handleChangeSectionId, handleMigrateSection } = usePersistantFunction({
        handleChangeSectionId(v: any) {
            setSectionMigrateVisible(v != null);
            fetchTableData();
        },
        async handleMigrateSection() {
            const ref = React.createRef<{ form: FormInstance }>();
            const { sectionId } = await filterers.validate();
            const arr = sectionDict[sectionId];
            const isParentId = arr != null;
            const section = isParentId
                ? sectionOptions.find(v => v.id === sectionId)
                : searchChildSection(sectionOptions, sectionId);
            const sectionName = section!.name;
            const postType = selectedRow[0].type;
            const treeData = isParentId
                ? sectionOptions
                      .filter((v: any) => v.type === postType)
                      .map(v =>
                          v.id === sectionId
                              ? {
                                    ...v,
                                    disabled: true,
                                    ...(v.children?.length === 1
                                        ? { children: [ { ...v.children[0], disabled: true } ] }
                                        : {}),
                                }
                              : { ...v, disabled: true }
                      )
                : sectionOptions
                      .filter((v: any) => v.type === postType)
                      .map(v =>
                          v.id === (section as { parentId: number }).parentId
                              ? {
                                    ...v,
                                    disabled: true,
                                    children: v.children?.map(k => (k.id === sectionId ? { ...k, disabled: true } : k)),
                                }
                              : { ...v, disabled: true }
                      );
            Modal.confirm({
                title: '栏目迁移',
                closable: true,
                icon: null,
                className: 'club-post-section-modal',
                content: (
                    <PostSectionMigrateForm
                        ref={ref}
                        length={selectedRow.length}
                        treeData={treeData}
                        sectionName={sectionName}
                    />
                ),
                async onOk() {
                    const { sectionId } = await ref.current!.form.validateFields();
                    await batchMigratePostSection(
                        { toSectionId: sectionId, postId: selectedRow.map(v => v.id) },
                        clubDeployVersion
                    );
                    message.success('迁移成功！');
                    setselectedRow([]);
                    fetchTableData();
                },
            });
        },
    });

    const renderRecommendNode = useCallback((row: PostListItem) => {
        return (
            row?.topHomeRecommend === TopHomeRecommend.Recommend && (
                <Tag color="#f50">
                    <span>首页推荐</span>
                    {![ DATE_TYPE.Forever, DATE_TYPE.Custom ].includes(row?.recommendTimetype as DATE_TYPE) &&
                    row?.recommendTime
                        ? row?.recommendTime
                        : ''}
                    <span>{DateTypeConstant[row?.recommendTimetype as DATE_TYPE]}</span>
                    {row?.recommendTimetype === DATE_TYPE.Custom && row?.recommendTime ? `${row?.recommendTime}天` : ''}
                    {row?.recommendTimetype === DATE_TYPE.Forever ? '' : `至${simpleTime(row?.recommendEndTime)}`}
                </Tag>
            )
        );
    }, []);

    // 解析帖子内容得到话题名称
    const getPostContentTopic = useCallback((input: string) => {
        if (!input) {
            return null;
        }

        try {
            const list: string[] = [];
            // 正则匹配：#开始，标点符号或空格或下一个#为结束
            const regex = /#([^#\s，。、！？：；,.!?]+)/g;
            let match: RegExpExecArray | null;

            while ((match = regex.exec(input)) !== null) {
                list.push(match[1]);
            }

            return list.length > 0 ? list : null;
        } catch (ex) {
            console.error(`[getPostContentTopic] ${input} 解析异常`, ex);
            return null;
        }
    }, []);

    const [ batchOperateLoading, setBatchOperateLoading ] = useState(false);
    const handleBatchOperate = useCallback(
        async (type: BATCH_OPERATE_POST_TYPE, operation: IS_ENABLE) => {
            setBatchOperateLoading(true);
            try {
                if (operation === IS_ENABLE.Enable && type === BATCH_OPERATE_POST_TYPE.MoveColumn) {
                    handleMigrateSection();
                    return;
                }
                if (operation === IS_ENABLE.Enable && type === BATCH_OPERATE_POST_TYPE.Rating) {
                    setPostRatingVisible(true);
                    return;
                }
                if (operation === IS_ENABLE.Enable && type === BATCH_OPERATE_POST_TYPE.Mark) {
                    setPostMarkVisible(true);
                    return;
                }
                const { boardId } = await filterers.validate();

                const post = selectedRow.map(v => ({
                    id: v.id,
                    userId: v.userId,
                    userInfoId: v.userInfoId,
                }));
                const text = BatchOperateTypeConstants[type];
                Modal.confirm({
                    title: `批量${text}`,
                    content: (
                        <div>
                            {operation === IS_ENABLE.Enable ? (
                                <p className="port__delete__text">
                                    确认{text}
                                    <span style={{ color: '#1890ff' }}>{selectedRow.length}</span>个帖子吗？
                                </p>
                            ) : (
                                <p className="port__delete__text">
                                    确认取消<span style={{ color: '#1890ff' }}>{selectedRow.length}</span>个帖子的{text}
                                    吗？
                                </p>
                            )}
                            <p className="post_delete_tips">单次操作不超过10条，操作不可恢复，请谨慎操作！</p>
                        </div>
                    ),
                    onOk: async () => {
                        const { code, msg } = await batchOperatePost(
                            { boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1] },
                            {
                                post,
                                type,
                                operation,
                            },
                            clubDeployVersion
                        );
                        if (code === 0) {
                            message.success('操作成功');
                            fetchTableData();
                        } else {
                            message.error(msg || '操作失败');
                        }
                    },
                    onCancel: () => {},
                });
            } finally {
                setBatchOperateLoading(false);
            }
        },
        [ clubDeployVersion, fetchTableData, filterers, handleMigrateSection, selectedRow ]
    );

    const [ operationStatus, setOperationStatus ] = useState<POST_OPERATION_STATUS | null>(null);

    const onCancelOperateStatus = useCallback(() => {
        const cancelStatus = CancelOperationStatusMap[operationStatus!];
        handleBatchOperate(cancelStatus, IS_ENABLE.Unable);
    }, [ handleBatchOperate, operationStatus ]);

    const batchOperateMenuNodes = useMemo(() => {
        return BatchOperateTypeOptions.map(item => {
            return (
                <Menu.Item
                    disabled={
                        !selectedRow.length ||
                        (!sectionMigrateVisible && item.value === BATCH_OPERATE_POST_TYPE.MoveColumn)
                    }
                    key={item.value}
                    onClick={() => {
                        handleBatchOperate(item.value, IS_ENABLE.Enable);
                    }}
                >
                    <span>{item.label}</span>
                </Menu.Item>
            );
        });
    }, [ handleBatchOperate, sectionMigrateVisible, selectedRow.length ]);

    const labelTypeOptions = useMemo(() => {
        let result: UserLabelTreeType[] = [];
        try {
            if (!userLabelDictAll[clubDeployVersion]) {
                return;
            }
            let userLabelDict = groupBy(userLabelDictAll[clubDeployVersion] ?? [], 'parentId');
            result = userLabelDict[0].map(x => ({
                ...x,
                title: x.name,
                value: x.id,
                children: userLabelDict[x.id as any]?.map(child => ({
                    ...child,
                    title: child.name,
                    value: child.id,
                })),
            }));
        } catch (e) {
            console.log('userlLabelTreeList', e);
        }
        return result;
    }, [ clubDeployVersion, userLabelDictAll ]);

    // 表格数据
    const tableProps: Q1TablePropsType<PostListItem> = useMemo(() => {
        const operationColumns: ColumnsType<PostListItem> =
            tableType === TABLE_TYPE.Record
                ? [
                      {
                          title: '操作',
                          dataIndex: 'operation',
                          key: 'operation',
                          align: 'left',
                          switch: 1,
                          disabledSwitch: true,
                          resizable: false,
                          width: 300,
                          fixed: 'right',
                          render: (v, row: PostListItem) => {
                              return (
                                  <div className="club_post_table__ops">
                                      <Permissions value="btn__query__club_post_detail">
                                          <Button type="link" onClick={() => handleShowDetail(row)}>
                                              详情
                                          </Button>
                                      </Permissions>
                                      <Permissions value="btn__update__club_post">
                                          {row.status !== AUDIT_STATUS.Rejected ? (
                                              <Button type="link" onClick={() => handleShowEdit(row)}>
                                                  编辑
                                              </Button>
                                          ) : (
                                              ''
                                          )}
                                      </Permissions>
                                      <Permissions value="btn__update__club_post_toTop">
                                          {row.status !== AUDIT_STATUS.Revoked ? (
                                              <Button
                                                  type="link"
                                                  onClick={() => {
                                                      if (!row.isTop) {
                                                          setSelectData({
                                                              ...row,
                                                              dateValue: DATE_VALUE.Forever,
                                                              dateType: DATE_TYPE.Forever,
                                                          } as any);
                                                          setVisibleTotopModal({
                                                              visible: true,
                                                              topRecomendType: TOP_HOME_RECOMMEND.Top,
                                                              isEdit: false,
                                                          });
                                                      } else {
                                                          handleAction(
                                                              row,
                                                              'postToTop',
                                                              {
                                                                  id: row?.id,
                                                                  isTop: 0,
                                                                  userId: row.userId,
                                                                  userInfoId: row.userInfoId,
                                                              },
                                                              '取消置顶'
                                                          );
                                                      }
                                                  }}
                                              >
                                                  {row?.isTop ? '取消置顶' : '置顶'}
                                              </Button>
                                          ) : (
                                              ''
                                          )}
                                      </Permissions>
                                      <Permissions value="btn__update__club_post_boutique">
                                          {row.status !== AUDIT_STATUS.Revoked ? (
                                              <Button
                                                  type="link"
                                                  onClick={() => {
                                                      handleAction(
                                                          row,
                                                          'postBoutique',
                                                          {
                                                              id: row?.id,
                                                              isBoutique: row?.isBoutique === 1 ? 0 : 1,
                                                              userId: row.userId,
                                                              userInfoId: row.userInfoId,
                                                          },
                                                          row?.isBoutique === 1 ? '取消加精' : '加精'
                                                      );
                                                  }}
                                              >
                                                  {row?.isBoutique === 1 ? '取消加精' : '加精'}
                                              </Button>
                                          ) : (
                                              ''
                                          )}
                                      </Permissions>
                                      <Permissions value="btn__update__club_post_limitComment">
                                          {row.status !== AUDIT_STATUS.Revoked ? (
                                              <Button
                                                  type="link"
                                                  onClick={() => {
                                                      handleAction(
                                                          row,
                                                          'postLimitComment',
                                                          {
                                                              id: row?.id,
                                                              isLimitComment: row?.limitComment === 1 ? 0 : 1,
                                                          },
                                                          row?.limitComment === 1 ? '取消限制评论' : '限制评论'
                                                      );
                                                  }}
                                              >
                                                  {row?.limitComment === 1 ? '取消限制' : '限制评论'}
                                              </Button>
                                          ) : (
                                              ''
                                          )}
                                      </Permissions>
                                      <Permissions value="btn__update__club_post_sink">
                                          {row.status !== AUDIT_STATUS.Revoked ? (
                                              <Button
                                                  type="link"
                                                  onClick={() => {
                                                      handleAction(
                                                          row,
                                                          'postSink',
                                                          {
                                                              id: row?.id,
                                                              isSink: row?.isBoutique === 2 ? 0 : 1,
                                                          },
                                                          row?.isBoutique === 2 ? '取消下沉' : '下沉'
                                                      );
                                                  }}
                                              >
                                                  {row?.isBoutique === 2 ? '取消下沉' : '下沉'}
                                              </Button>
                                          ) : (
                                              ''
                                          )}
                                      </Permissions>
                                      <Permissions value="btn__update__club_post_recommend">
                                          {row.status === AUDIT_STATUS.Passed &&
                                          row?.isBoutique !== 2 &&
                                          row?.topHomeRecommend === 1 ? (
                                              <Button type="link" onClick={() => handlePostRecommend(row, true)}>
                                                  编辑推荐
                                              </Button>
                                          ) : (
                                              ''
                                          )}
                                      </Permissions>
                                      <Permissions value="btn__update__club_post_recommend">
                                          {row.status === AUDIT_STATUS.Passed && row?.isBoutique !== 2 ? (
                                              <Button type="link" onClick={() => handlePostRecommend(row)}>
                                                  {row?.topHomeRecommend === 1 ? '取消推荐' : '首页推荐'}
                                              </Button>
                                          ) : (
                                              ''
                                          )}
                                      </Permissions>
                                      <Permissions value="btn__update__club_post_revoke">
                                          {row.status === AUDIT_STATUS.Passed &&
                                          row?.releaseTime &&
                                          moment(row.releaseTime * 1000).isAfter(moment()) ? (
                                              <Button type="link" onClick={() => handleRevokePost(row)}>
                                                  撤回
                                              </Button>
                                          ) : (
                                              ''
                                          )}
                                      </Permissions>
                                  </div>
                              );
                          },
                      },
                  ]
                : [
                      {
                          title: '操作',
                          dataIndex: 'operation',
                          key: 'operation',
                          align: 'left',
                          switch: 1,
                          disabledSwitch: true,
                          resizable: false,
                          fixed: 'right',
                          width: 100,
                          render: (v, row: PostListItem) => {
                              return (
                                  <ActionGroup
                                      className="operation-btn-group"
                                      btns={[
                                          {
                                              title: '',
                                              icon: '',
                                              hidden: !hasFunctionPermit('btn__query__club_post_detail'),
                                              props: {
                                                  type: 'link' as ButtonType,
                                                  children: '详情',
                                                  onClick: () => handleShowDetail(row),
                                              },
                                          },
                                          {
                                              title: '',
                                              icon: '',
                                              hidden: !hasFunctionPermit('btn__update__club_post'),
                                              props: {
                                                  type: 'link' as ButtonType,
                                                  children: '编辑',
                                                  onClick: () => handleShowEdit(row),
                                              },
                                          },
                                          {
                                              title: '',
                                              icon: '',
                                              hidden:
                                                  !hasFunctionPermit('btn__update__club_post_revoke') ||
                                                  row.status !== AUDIT_STATUS.MachinePassed ||
                                                  !row?.releaseTime ||
                                                  moment(row.releaseTime * 1000).isBefore(moment()),
                                              props: {
                                                  type: 'link' as ButtonType,
                                                  children: '撤回',
                                                  onClick: () => handleRevokePost(row),
                                              },
                                          },
                                      ]}
                                  />
                              );
                          },
                      },
                  ];

        const tableTools = (
            <>
                {tableType === TABLE_TYPE.Record ? (
                    <Permissions value="btn__add__club_post" name="发帖">
                        <Button
                            type="primary"
                            onClick={() => {
                                handleShowEdit(undefined);
                            }}
                        >
                            发布帖子
                        </Button>
                    </Permissions>
                ) : (
                    ''
                )}
                {tableType === TABLE_TYPE.Record ? (
                    <>
                        <Permissions value="btn__del__club_post_batchDel" name="删除">
                            <Button type="primary" onClick={handleBatchDelete} disabled={!selectedRow.length}>
                                批量删除
                            </Button>
                        </Permissions>
                        <Permissions value="btn__update__club_status_batch" name="批量操作">
                            <Dropdown overlay={<Menu>{batchOperateMenuNodes}</Menu>} trigger={[ 'click' ]}>
                                <Button
                                    disabled={!selectedRow.length}
                                    type="primary"
                                    loading={batchOperateLoading}
                                    icon={<DownOutlined />}
                                >
                                    批量操作
                                </Button>
                            </Dropdown>
                        </Permissions>
                        {operationStatus && CancelPostOperationStatus.includes(operationStatus) && (
                            <Permissions value="btn__update__club_status_batch" name="批量操作">
                                <Button
                                    disabled={!selectedRow.length}
                                    type="primary"
                                    loading={batchOperateLoading}
                                    onClick={() => onCancelOperateStatus()}
                                >
                                    {BatchCancelOperationStatusConstants[operationStatus]}
                                </Button>
                            </Permissions>
                        )}
                    </>
                ) : (
                    <Permissions value="btn__update__club_post_batchAudit" name="审核">
                        <Button
                            type="primary"
                            onClick={() => batchMachineAudit()}
                            disabled={!selectedRow.length}
                            loading={batchMachineAuditLoading}
                        >
                            批量机审
                        </Button>
                        <Button
                            type="primary"
                            onClick={openBatchAuditModal}
                            disabled={!selectedRow.length}
                            style={{ marginLeft: '10px' }}
                        >
                            批量人工复审
                        </Button>
                    </Permissions>
                )}
            </>
        );

        const columns1: ColumnsType<PostListItem> =
            tableType === TABLE_TYPE.Record
                ? [
                      {
                          title: '审核人',
                          dataIndex: 'auditedBy',
                          switch: 1,
                          disabledSwitch: true,
                          width: 120,
                          align: 'left',
                      },
                      {
                          title: '审核时间',
                          dataIndex: 'auditTime',
                          switch: 1,
                          disabledSwitch: true,
                          align: 'left',
                          width: 160,
                          render: (v: string) => {
                              return <DateShortItem formatShort="YYYY-MM-DD HH:mm:ss" date={v} />;
                          },
                      },
                      {
                          title: '对外发布时间',
                          dataIndex: 'releaseTime',
                          switch: 1,
                          disabledSwitch: true,
                          align: 'left',
                          sorter: true,
                          width: 160,
                          render: (v: string, row) => {
                              return (
                                  <>
                                      {row.releaseTime ? (
                                          <DateShortItem
                                              formatShort="YYYY-MM-DD HH:mm:ss"
                                              date={row.releaseTime * 1000}
                                          />
                                      ) : row.auditTime ? (
                                          <DateShortItem formatShort="YYYY-MM-DD HH:mm:ss" date={row.auditTime} />
                                      ) : (
                                          ''
                                      )}
                                  </>
                              );
                          },
                      },
                  ]
                : [];

        return {
            columns: [
                {
                    title: '帖子ID',
                    dataIndex: 'id',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                    width: 80,
                },
                {
                    title: '帖子标题',
                    dataIndex: 'title',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                    width: 256,
                    render: (v, row) => {
                        const { topic, content } = row;
                        let showVoteIcon = false;
                        if (content) {
                            const parseContent = JSON.parse(content);
                            if (Array.isArray(parseContent)) {
                                showVoteIcon = parseContent.find(item => item.Type === RICH_TEXT_TYPE_ENUM.Vote);
                            }
                        }
                        return (
                            <>
                                {v || '-'}
                                {showVoteIcon && (
                                    <div
                                        className={classNames({ 'q1-link': tableType === TABLE_TYPE.Record })}
                                        onClick={e => {
                                            if (tableType !== TABLE_TYPE.Record) {
                                                return;
                                            }
                                            e.preventDefault();
                                            e.stopPropagation();
                                            redirctToVoteDetail(row);
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                                            <img src={placeholderVote} width={24} alt="" />
                                            <span style={{ marginLeft: 4 }}>{topic}</span>
                                        </div>
                                    </div>
                                )}
                                <div className="club_post_table__title">
                                    {row?.isTop === 1 && (
                                        <Tag color="#f50">
                                            <span>置顶</span>
                                            {![ DATE_TYPE.Forever, DATE_TYPE.Custom ].includes(
                                                row?.topTimeType as DATE_TYPE
                                            ) && row?.topTime
                                                ? row?.topTime
                                                : ''}
                                            <span>{DateTypeConstant[row?.topTimeType as DATE_TYPE]}</span>
                                            {row?.topTimeType === DATE_TYPE.Custom && row?.topTime
                                                ? `${row?.topTime}天`
                                                : ''}
                                            {row?.topTimeType === DATE_TYPE.Forever
                                                ? ''
                                                : `至${simpleTime(row?.topEndTime)}`}
                                        </Tag>
                                    )}
                                    {renderRecommendNode(row)}
                                    {row?.isBoutique === 1 && <Tag color="#87d068">加精</Tag>}
                                    {row?.isBoutique === 2 && <Tag color="gray">下沉</Tag>}
                                    {row?.limitComment === 1 && <Tag color="orange">限制评论</Tag>}
                                </div>
                            </>
                        );
                    },
                },
                {
                    title: '帖子内容',
                    dataIndex: 'content',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                    width: 300,
                    render: (v, row) => {
                        return (
                            <span
                                className="btn-link"
                                onClick={() => {
                                    handleShowDetail(row);
                                }}
                            >
                                <PostContent
                                    {...(row as any)}
                                    redirctToVoteDetail={() => redirctToVoteDetail(row)}
                                    tableType={tableType}
                                />
                            </span>
                        );
                    },
                },
                {
                    title: '投稿类型',
                    dataIndex: 'type',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                    width: 120,
                    render: (v: MOMENT_TYPE) => MomentTypeConstant[v],
                },
                {
                    title: '帖子状态',
                    dataIndex: 'status',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                    width: 120,
                    render: v => {
                        return (
                            <span style={{ color: AuditStatusColor[v as keyof typeof AuditStatusColor] }}>
                                {AuditStatusConstant[v as keyof typeof AuditStatusConstant]}
                            </span>
                        );
                    },
                },
                ...(tableType === TABLE_TYPE.Record
                    ? [
                          {
                              title: '评级',
                              dataIndex: 'rating',
                              switch: 1,
                              disabledSwitch: true,
                              align: 'left',
                              width: 80,
                              render: (v: POST_RATING) => (v ? PostRatingConstants[v] : ''),
                          },
                      ]
                    : []),
                {
                    title: '所属版块',
                    dataIndex: 'boardName',
                    switch: 1,
                    disabledSwitch: true,
                    width: 160,
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
                    title: '话题',
                    dataIndex: 'topics',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                    width: 166,
                    render: (data: string[], row) => {
                        let contentTopics: string[] = [];
                        try {
                            let parsePostContent = JSON.parse(row.content);
                            for (let i = 0; i < parsePostContent.length; i++) {
                                let parseTopics = getPostContentTopic(parsePostContent[i].Data);
                                if (parseTopics && parseTopics.length > 0) {
                                    contentTopics = [ ...contentTopics, ...parseTopics ];
                                }
                            }
                        } catch (err) {
                            console.log('err');
                        }
                        let renderHtml: React.ReactNode = '';
                        const allTopics = [ ...(tableType === TABLE_TYPE.Audit ? contentTopics : []), ...(data || []) ];
                        if (allTopics?.length > MAX_TOPIC_TAG_SHOW_COUNT) {
                            renderHtml = (
                                <Popover
                                    placement="bottom"
                                    content={
                                        <div style={{ maxHeight: '50vh', maxWidth: '1200px', overflow: 'auto' }}>
                                            {allTopics.map((item, index: number) => {
                                                return (
                                                    <div
                                                        key={index}
                                                        className={
                                                            index < contentTopics.length &&
                                                            tableType === TABLE_TYPE.Audit
                                                                ? 'club-content-topic-tag'
                                                                : 'club-select-topic-tag'
                                                        }
                                                    >
                                                        {'#' + item}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    }
                                >
                                    <div>
                                        {allTopics.slice(0, MAX_TOPIC_TAG_SHOW_COUNT).map((item, index) => (
                                            <div
                                                key={index}
                                                className={
                                                    index < contentTopics.length && tableType === TABLE_TYPE.Audit
                                                        ? 'club-content-topic-tag'
                                                        : 'club-select-topic-tag'
                                                }
                                            >
                                                {'#' + item}
                                            </div>
                                        ))}
                                        ...
                                    </div>
                                </Popover>
                            );
                        } else {
                            renderHtml = allTopics?.map((item, index) => (
                                <div
                                    key={index}
                                    className={
                                        index < contentTopics.length && tableType === TABLE_TYPE.Audit
                                            ? 'club-content-topic-tag'
                                            : 'club-select-topic-tag'
                                    }
                                >
                                    {'#' + item}
                                </div>
                            ));
                        }

                        return renderHtml;
                    },
                },
                {
                    title: '标签',
                    dataIndex: 'tags',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                    width: 300,
                    render: (data: string) => {
                        let renderHtml: React.ReactNode = '';
                        if (!data) {
                            return renderHtml;
                        }
                        const tags = JSON.parse(data) as string[];
                        if (tags?.length > 8) {
                            // 超过2行
                            renderHtml = (
                                <Popover
                                    title="标签详情"
                                    placement="bottom"
                                    content={
                                        <div style={{ maxHeight: '50vh', maxWidth: '1200px', overflow: 'auto' }}>
                                            {tags.map((v, index: number) => (
                                                <Tag key={index} color="blue" style={{ marginBottom: '4px' }}>
                                                    {v}
                                                </Tag>
                                            ))}
                                        </div>
                                    }
                                >
                                    <div>
                                        {tags.slice(0, 8).map((v, index) => (
                                            <Tag key={index} color="blue" style={{ marginBottom: '4px' }}>
                                                {v}
                                            </Tag>
                                        ))}
                                        <Tag color="blue">
                                            <PlusOutlined /> {tags.length - 8}
                                        </Tag>
                                    </div>
                                </Popover>
                            );
                        } else {
                            renderHtml = tags.map((v, index) => (
                                <Tag key={index} color="blue" style={{ marginBottom: '4px' }}>
                                    {v}
                                </Tag>
                            ));
                        }

                        return renderHtml;
                    },
                },
                {
                    title: '浏览数',
                    dataIndex: 'clickCount',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                    width: 120,
                    sorter: true,
                },
                {
                    title: '浏览数（去重）',
                    dataIndex: 'distinctViewCount',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                    width: 140,
                },
                {
                    title: '点赞数',
                    dataIndex: 'thumbsUpCount',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                    width: 120,
                    sorter: true,
                    render: (v, row) => {
                        return (
                            <span onClick={() => onShowThumbsDetail(row)} className={v > 0 ? 'q1-link' : ''}>
                                {v}
                            </span>
                        );
                    },
                },
                {
                    title: '评论数',
                    dataIndex: 'commentCount',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                    width: 120,
                    sorter: true,
                },
                {
                    title: '评论数（去重）',
                    dataIndex: 'distinctComment',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                    width: 140,
                    sorter: true,
                },
                ...(tableType === TABLE_TYPE.Record
                    ? [
                          {
                              title: '收藏数',
                              dataIndex: 'collectionUpCount',
                              switch: 1,
                              disabledSwitch: true,
                              width: 120,
                              align: 'left',
                              sorter: true,
                          },
                      ]
                    : []),
                {
                    title: '发布人昵称',
                    dataIndex: 'nickName',
                    switch: 1,
                    disabledSwitch: true,
                    width: 150,
                    align: 'left',
                },
                {
                    title: '发布人冰川通行证ID',
                    dataIndex: 'userId',
                    switch: 1,
                    disabledSwitch: true,
                    width: 150,
                    align: 'left',
                },
                {
                    title: '发布人冰川通行证名称',
                    dataIndex: 'userName',
                    switch: 1,
                    disabledSwitch: true,
                    width: 160,
                    align: 'left',
                },
                {
                    title: '创建时间',
                    dataIndex: 'createTime',
                    switch: 1,
                    disabledSwitch: true,
                    align: 'left',
                    sorter: true,
                    width: 160,
                    render: (v: string, row) => {
                        return (
                            <>
                                {v ? <DateShortItem formatShort="YYYY-MM-DD HH:mm:ss" date={v} /> : ''}
                                {row?.releaseTime ? <Tag color="blue">定时发布</Tag> : ''}
                            </>
                        );
                    },
                },
                ...columns1,
                {
                    title: '备注',
                    dataIndex: 'remark',
                    switch: 1,
                    disabledSwitch: true,
                    width: 150,
                    ellipsis: true,
                    align: 'left',
                },
                ...(tableType === TABLE_TYPE.Record
                    ? [
                          {
                              title: '标记类型',
                              dataIndex: 'mark',
                              switch: 1,
                              disabledSwitch: true,
                              width: TableColumnWidth.normal,
                              align: 'left',
                              render: (v: POST_MARK) => PostMarkConstants[v],
                          },
                      ]
                    : []),
                ...operationColumns,
            ] as ColumnsType<PostListItem>,

            dataSource: tableData.data,
            rowKey: 'id',
            tableName: `operation@page__list__club_content_post@${tableType}`,
            loading,
            tableTools,
            download: tableType === TABLE_TYPE.Record && hasFunctionPermit('btn__down__club_post') && download,
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
            scroll: { y: getTableHeight, x: 2600 },
        };
    }, [
        tableType,
        handleBatchDelete,
        selectedRow.length,
        batchOperateMenuNodes,
        batchOperateLoading,
        operationStatus,
        batchMachineAuditLoading,
        openBatchAuditModal,
        tableData.data,
        tableData.total,
        loading,
        hasFunctionPermit,
        download,
        currentPagination.pageIndex,
        currentPagination.pageSize,
        rowSelection,
        getTableHeight,
        handleShowDetail,
        handleShowEdit,
        handleAction,
        handlePostRecommend,
        handleRevokePost,
        onCancelOperateStatus,
        batchMachineAudit,
        renderRecommendNode,
        redirctToVoteDetail,
        getPostContentTopic,
        onShowThumbsDetail,
    ]);

    const handleChangeBoardId = useCallback(
        async val => {
            const filter = await filterers.validate();
            fetchSectionList(val);
            setInitialValues({ ...filter, sectionId: null } as any);
            setSectionMigrateVisible(false);
            fetchTableData();
            setclubDeployVersion(val.split(BOARD_PERMIT_SEPARATE)[0]);
        },
        [ fetchSectionList, fetchTableData, filterers ]
    );
    const filterSelectionData = useMemo(() => {
        return tableType === TABLE_TYPE.Audit ? USERLABEL_FILTER_AUDIT_OPTIONS : USERLABEL_FILTER_RECORD_OPTIONS;
    }, [ tableType ]);
    const timePicker = useMemo(() => {
        if (tableType === TABLE_TYPE.Record) {
            return (
                <>
                    {RANGE_PICKER_LIST.map((v, i) => (
                        <FilterBox.Item {...v} key={i}>
                            <RangePicker allowClear ranges={quickPickTimeRange} inputReadOnly />
                        </FilterBox.Item>
                    ))}
                </>
            );
        }
    }, [ tableType ]);

    return (
        <>
            <FilterBox
                context={filterers}
                query={fetchTableDataByFilter}
                tableName="clubPostTable"
                showAdvancedFilter={false}
                initialValues={initialValues}
                key={JSON.stringify(initialValues)} // 为了刷新form
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
                        className="club-post-section-treeSelect"
                        treeData={sectionOptions}
                        onChange={handleChangeSectionId}
                    />
                </FilterBox.Item>
                <FilterBox.Item name="type" label="投稿类型">
                    <Select options={MomentFilterOptionsData} allowClear placeholder="所有类型"></Select>
                </FilterBox.Item>
                <FilterBox.Item name="status" label="帖子状态">
                    {tableType === TABLE_TYPE.Record ? (
                        <Select options={postRecordStatusOptionsData} allowClear></Select>
                    ) : (
                        <Select options={PostAuditOptions} allowClear></Select>
                    )}
                </FilterBox.Item>
                {tableType === TABLE_TYPE.Record ? (
                    <FilterBox.Item name="ratings" label="评级">
                        <Select
                            options={PostRatingOptions}
                            allowClear
                            placeholder="不限"
                            mode="multiple"
                            maxTagCount={3}
                        ></Select>
                    </FilterBox.Item>
                ) : null}
                {tableType === TABLE_TYPE.Record ? (
                    <FilterBox.Item name="mark" label="标记类型">
                        <Select options={PostMarkOptions} allowClear placeholder="请输入"></Select>
                    </FilterBox.Item>
                ) : null}
                <FilterBox.Item name="topic" label="话题">
                    <Input placeholder="请输入" style={{ width: 250 }} allowClear />
                </FilterBox.Item>
                {tableType === TABLE_TYPE.Record ? (
                    <FilterBox.Item name="operationStatus" label="操作状态">
                        <Select options={PostOperationOptions} allowClear placeholder="所有状态"></Select>
                    </FilterBox.Item>
                ) : null}
                <FilterBox.Item className="filterbox-compact-model" type="compactNormal">
                    <Input.Group compact>
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
                                        <Input placeholder="请输入" style={{ width: 250 }} allowClear />
                                    </FilterBox.Item>
                                ) : (
                                    <FilterBox.Item name="title" noStyle>
                                        <Input placeholder="请输入" style={{ width: 250 }} allowClear />
                                    </FilterBox.Item>
                                );
                            }}
                        </FilterBox.Item>
                    </Input.Group>
                </FilterBox.Item>

                <FilterBox.Item
                    className="filterbox-compact-model"
                    type="compactNormal"
                    style={{ whiteSpace: 'nowrap' }}
                >
                    <Input.Group compact>
                        <FilterBox.Item name="passportFilterType" noStyle>
                            <Select options={filterSelectionData} />
                        </FilterBox.Item>
                        <FilterBox.Item
                            noStyle
                            shouldUpdate={(prev, next) => prev.passportFilterType !== next.passportFilterType}
                        >
                            {({ getFieldValue }) =>
                                transformFilterItemCom(getFieldValue('passportFilterType'), labelTypeOptions || [])
                            }
                        </FilterBox.Item>
                    </Input.Group>
                </FilterBox.Item>
                {timePicker}
            </FilterBox>

            <div ref={tableEl}>
                <Q1Table {...tableProps} />
            </div>
            <PostAudit
                visible={batchAuditVisible}
                selectedRows={selectedRow}
                onSuccess={() => {
                    setBatchAuditVisible(false);
                    setselectedRow([]);
                    fetchTableData();
                }}
                oncancel={() => {
                    setBatchAuditVisible(false);
                }}
                clubDeployVersion={clubDeployVersion}
            />
            <PostDetail
                visible={detailVisiable}
                data={selectData}
                clubDeployVersion={clubDeployVersion}
                onClose={() => {
                    setDetailVisiable(false);
                }}
            />
            <PostEdit
                type={editType}
                clubDeployVersion={clubDeployVersion}
                visible={editVisiable}
                data={selectData}
                onClose={() => {
                    setEditVisiable(false);
                    fetchTableData();
                }}
            />
            <Totop
                data={selectData}
                clubDeployVersion={clubDeployVersion}
                isEdit={visibleTotopModal.isEdit}
                visible={visibleTotopModal.visible}
                type={visibleTotopModal.topRecomendType}
                onOk={() => {
                    setVisibleTotopModal({
                        ...visibleTotopModal,
                        visible: false,
                        isEdit: false,
                    });
                    fetchTableData();
                }}
                onCancel={() => {
                    setVisibleTotopModal({
                        ...visibleTotopModal,
                        visible: false,
                        isEdit: false,
                    });
                }}
            />
            <PostRating
                selectedRow={selectedRow}
                clubDeployVersion={clubDeployVersion}
                visible={postRatingVisible}
                onOk={() => {
                    setPostRatingVisible(false);
                    fetchTableData();
                }}
                onCancel={() => {
                    setPostRatingVisible(false);
                }}
            />
            <PostMark
                selectedRow={selectedRow}
                clubDeployVersion={clubDeployVersion}
                visible={postMarkVisible}
                onOk={() => {
                    setPostMarkVisible(false);
                    fetchTableData();
                }}
                onCancel={() => {
                    setPostMarkVisible(false);
                }}
            />
            <PostLike
                postId={thumbsDetailData.thumbsDetailId}
                visible={thumbsDetailData.thumbsVisible}
                clubDeployVersion={clubDeployVersion}
                boardId={thumbsDetailData.thumbsDetailBoardId}
                onClose={() => {
                    setThumbsDetailData({
                        ...thumbsDetailData,
                        thumbsVisible: false,
                    });
                }}
            />
        </>
    );
};

export default inject('UIState', 'Permit', 'GameContext', 'User', 'Club')(observer(TableList));
