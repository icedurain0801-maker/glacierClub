import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ColumnsType, FilterBox, Q1Table, Q1TablePropsType } from 'q1-antd';
import { Card, Col, Row, Select, Spin } from 'antd';
import { inject, observer } from 'mobx-react';
import type { Store } from 'antd/es/form/interface';
import { get } from 'lodash';

import { useReactive } from '@/context';
import { getModelTag } from '@/api/club';
import { useTableAdaptHeight } from '@/utils/tableAdapt';

import { BoardPermitOptionsType, BOARD_PERMIT_SEPARATE, ModelTag } from '@ts/club';
import { OMIT_TABLE_HEIGHT } from '@ts/clientModel';
import { FeedbackResponseType2 } from '@ts/api';
import { DefaultPagination } from '@ts/enum/table';

import PieChart, { PieDataItem } from './PieChart';
import { usePremitClubBoard } from '../../board/hooks/useClubBoardOptions';
require('./index.less');
interface TagListProps {
    clubBoardOptions: BoardPermitOptionsType[];
}
interface TagListPropsMobx extends TagListProps, Pick<Store, 'Club'> {}
function TagList(props: TagListProps) {
    const { clubBoardOptions } = props as TagListPropsMobx;

    const filterbox = FilterBox.useFilterBox();
    const tableEl = useRef<HTMLDivElement>(null);
    const [ currentPagination, setCurrentPagination ] = useState(DefaultPagination);
    const [ tableData, setTableData ] = useState<FeedbackResponseType2<ModelTag[]>>(
        {} as FeedbackResponseType2<ModelTag[]>
    );
    const getTableHeight = useTableAdaptHeight(tableEl, OMIT_TABLE_HEIGHT);
    const [ chartData, setChartData ] = useState<PieDataItem[]>([]);
    const [ loading, setLoading ] = useState(false);

    const [ clubDeployVersion, setclubDeployVersion ] = useState(get(clubBoardOptions, '0.value'));
    // form 表单查询
    let initVal = useMemo(() => {
        return { field: 'userId', boardId: get(clubBoardOptions, '0.children.0.value') };
    }, [ clubBoardOptions ]);

    // 详情
    const [ , setBoardId ] = useState(get(clubBoardOptions, '0.children.0.value').split(BOARD_PERMIT_SEPARATE)[1]);
    const fetchChartData = useCallback(async () => {
        setLoading(true);

        try {
            const { boardId, ...values } = await filterbox.validate();
            let query = { boardId: boardId.split(BOARD_PERMIT_SEPARATE)[1], ...values };
            const { code, data } = await getModelTag(query, clubDeployVersion);
            if (code === 0 && data) {
                setChartData(data.map(v => ({ name: v.name, num: v.count })));
                const filterTableData = data.filter(v => !v.isOther);
                setTableData({ data: filterTableData, total: filterTableData.length });
            } else {
                setChartData([]);
                setTableData({ data: [], total: 0 });
            }
        } finally {
            setLoading(false);
        }
    }, [ clubDeployVersion, filterbox ]);

    const handleChangeBoardId = useCallback(
        async val => {
            const [ clubDeploy ] = val.split(BOARD_PERMIT_SEPARATE);
            setBoardId(val.split(BOARD_PERMIT_SEPARATE)[1]);
            setclubDeployVersion(clubDeploy);
            fetchChartData();
        },
        [ fetchChartData ]
    );

    useEffect(() => {
        fetchChartData();
    }, [ fetchChartData ]);

    useReactive(() => {
        fetchChartData();
    });

    const pieChartCard = useMemo(() => {
        return (
            <Card className="club-user-tag-pie-card">
                <h2 className="sub-title mb-0">标签分布</h2>
                <Row>
                    <Col span={12}>
                        <PieChart data={chartData.slice(0, 10)}></PieChart>
                    </Col>
                </Row>
            </Card>
        );
    }, [ chartData ]);
    function handleChange(nextPagination: any, filters: any, sorter: any) {
        setCurrentPagination({
            pageIndex: nextPagination.current,
            pageSize: nextPagination.pageSize || DefaultPagination.pageSize,
        });
    }
    const tableProps: Q1TablePropsType<ModelTag> = useMemo(() => {
        const columns: ColumnsType<ModelTag> = [
            {
                title: '标签ID',
                dataIndex: 'id',
                width: 160,
            },
            {
                title: '标签名称',
                dataIndex: 'name',
                width: 160,
            },
            {
                title: '标签词库',
                dataIndex: 'tags',
                width: 1000,
                render(v, r: ModelTag) {
                    return v ? <span style={{ color: '#3399cc' }}>{JSON.parse(v).join('、')}</span> : '';
                },
            },
            {
                title: '标签总数',
                dataIndex: 'count',
                width: 120,
            },
        ];

        return {
            columns: columns,
            dataSource: tableData.data,
            rowKey: 'id',
            tableName: `operation@page__list__club_user_tag`,
            loading,
            tableTools: null,
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
        };
    }, [ currentPagination.pageIndex, currentPagination.pageSize, loading, tableData.data, tableData.total ]);
    return (
        <div>
            <FilterBox query={fetchChartData} tableName="clubUserTable" context={filterbox} initialValues={initVal}>
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
                {/* <FilterBox.Item name="name" label="标签名称">
                    <Input placeholder="请输入" allowClear />
                </FilterBox.Item> */}
            </FilterBox>
            <Spin spinning={loading}>
                {pieChartCard}
                <div ref={tableEl}>
                    <Q1Table {...tableProps} scroll={{ y: getTableHeight }} />
                </div>
            </Spin>
        </div>
    );
}

const TagListBase = inject('Club')(observer(TagList));

export default function TagListBaseHighOrder(props: any) {
    const { clubBoardOptions } = usePremitClubBoard();
    return !clubBoardOptions.length ? (
        <Spin size="large">
            <div style={{ height: '100vh' }}></div>
        </Spin>
    ) : (
        <TagListBase {...props} clubBoardOptions={clubBoardOptions} />
    );
}
