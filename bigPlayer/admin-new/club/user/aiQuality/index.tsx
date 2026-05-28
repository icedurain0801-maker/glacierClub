import { inject, observer } from 'mobx-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Select, Tabs } from 'antd';
import type { Rule } from 'antd/es/form';
import { FilterBox } from 'q1-antd';
import { get } from 'lodash';
import moment, { Moment } from 'moment';

import RangePicker from '@/components/RangePicker';
import { useContentTabSearch } from '@/context';
import { StoreType } from '@/store/config';
import { recentMonthQuickPickTimeRange } from '@/utils/date';

import { QUALITY_TYPE, QualityTypeValues, VerifyLevelOptions } from '@ts/clubQuality';

import { usePremitClubBoard } from '../../board/hooks/useClubBoardOptions';
import ClubLoaded from '../../components/ClubLoaded';
import Analysis from './components/analysis';
import VerifyList from './components/verifyList';
import AiQualityContext, { AiQualityQueryValues } from './context';

interface AiQualityProps {}

interface AiQualityPropsMobx extends AiQualityProps, Pick<StoreType, 'UIState'> {}

interface IProps {
    tableType: QUALITY_TYPE;
}

interface AiQualityFilterValues extends AiQualityQueryValues {
    actionTime?: [Moment, Moment];
}

function getDefaultActionTimeRange(): [Moment, Moment] {
    return [ moment().subtract(1, 'month').startOf('day'), moment().endOf('day') ];
}

function createInitialFilterValues(boardId?: string): AiQualityFilterValues {
    return {
        boardId,
        actionTime: getDefaultActionTimeRange(),
    };
}

function buildQueryValues(values: AiQualityFilterValues): AiQualityQueryValues {
    const { actionTime, ...rest } = values;

    return {
        ...rest,
        ...(actionTime?.length
            ? {
                  startTime: moment(actionTime[0]).startOf('day').format('YYYY-MM-DD HH:mm:ss'),
                  endTime: moment(actionTime[1]).endOf('day').format('YYYY-MM-DD HH:mm:ss'),
              }
            : {
                  startTime: undefined,
                  endTime: undefined,
              }),
    };
}

function AiQuality(props: IProps) {
    const { tableType } = props;
    const filterbox = FilterBox.useFilterBox();
    const { clubBoardOptions } = usePremitClubBoard();

    const defaultBoardId = useMemo(() => get(clubBoardOptions, '0.children.0.value') as string | undefined, [
        clubBoardOptions,
    ]);
    const initialValues = useMemo(() => createInitialFilterValues(defaultBoardId), [ defaultBoardId ]);
    const [ queryValues, setQueryValues ] = useState<AiQualityQueryValues>(() => buildQueryValues(initialValues));
    const [ queryVersion, setQueryVersion ] = useState(0);

    const actionTimeRules = useMemo(
        () => [
            {
                validator: (_: Rule, val?: [Moment, Moment]) => {
                    if (!val?.length) {
                        return Promise.reject('请选择日期');
                    }
                    if (val[1].diff(val[0], 'days') > 31) {
                        return Promise.reject('时间条件最长31天');
                    }
                    return Promise.resolve();
                },
            },
        ],
        []
    );

    useEffect(() => {
        if (queryValues.boardId || !defaultBoardId) {
            return;
        }

        setQueryValues(buildQueryValues(createInitialFilterValues(defaultBoardId)));
    }, [ defaultBoardId, queryValues.boardId ]);

    const applyFilters = useCallback(
        async (triggerRefresh = true) => {
            const values = (await filterbox.validate()) as AiQualityFilterValues;
            const nextQueryValues = buildQueryValues(values);

            setQueryValues(nextQueryValues);
            if (triggerRefresh) {
                setQueryVersion(prev => prev + 1);
            }

            return nextQueryValues;
        },
        [ filterbox ]
    );

    const fetchData = useCallback(async () => {
        await applyFilters(true);
    }, [ applyFilters ]);

    const handleBoardChange = useCallback(async () => {
        await applyFilters(true);
    }, [ applyFilters ]);

    const contextValue = useMemo(
        () => ({
            tableType,
            queryValues,
            setQueryValues,
            queryVersion,
            setQueryVersion,
        }),
        [ queryValues, queryVersion, tableType ]
    );

    return (
        <AiQualityContext.Provider value={contextValue}>
            <div>
                <FilterBox
                    query={fetchData}
                    tableName="clubAiQuailtyTable"
                    context={filterbox}
                    initialValues={initialValues}
                    key={`club-ai-quality-filter-${defaultBoardId ?? 'empty'}`}
                >
                    <FilterBox.Item name="boardId" label="所属版块" rules={[ { message: '请选择', required: true } ]}>
                        <Select onChange={handleBoardChange}>
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
                    <FilterBox.Item name="checkLevel" label="待校验等级">
                        <Select options={VerifyLevelOptions} allowClear placeholder="不限" />
                    </FilterBox.Item>
                    <FilterBox.Item name="actionTime" label="日期选择" rules={actionTimeRules}>
                        <RangePicker
                            ranges={recentMonthQuickPickTimeRange}
                            disabledDate={current => !!current && current.isAfter(moment().endOf('day'))}
                        />
                    </FilterBox.Item>
                </FilterBox>
                {queryValues.boardId ? (
                    <>
                        <Analysis />
                        <VerifyList />
                    </>
                ) : null}
            </div>
        </AiQualityContext.Provider>
    );
}

function AiQualityPage(props: AiQualityProps) {
    const { UIState } = props as AiQualityPropsMobx;
    const urlTableType = (useContentTabSearch().get('tableType') || QUALITY_TYPE.Post) as QUALITY_TYPE;
    const activeKey = QualityTypeValues.includes(urlTableType) ? urlTableType : QUALITY_TYPE.Post;

    const handleTabClick = useCallback(
        (key: string) => {
            if (key === activeKey) {
                return;
            }
            UIState.gotoTab({
                pathname: `/game/club/user/aiQuality`,
                search: `?tableType=${key}`,
            });
        },
        [ UIState, activeKey ]
    );

    return (
        <div>
            <Tabs activeKey={activeKey} className="page-content-tabbox" onTabClick={handleTabClick} animated={false}>
                <Tabs.TabPane tab="AI内容推荐" key={QUALITY_TYPE.Post}>
                    {activeKey === QUALITY_TYPE.Post ? <AiQuality tableType={QUALITY_TYPE.Post} /> : null}
                </Tabs.TabPane>
                <Tabs.TabPane tab="AI对话" key={QUALITY_TYPE.Message}>
                    {activeKey === QUALITY_TYPE.Message ? <AiQuality tableType={QUALITY_TYPE.Message} /> : null}
                </Tabs.TabPane>
            </Tabs>
        </div>
    );
}

const AiQualityMobx = inject('UIState')(observer(AiQualityPage));

function AiQualityMobxAdvanced() {
    return (
        <ClubLoaded>
            <AiQualityMobx />
        </ClubLoaded>
    );
}

export default AiQualityMobxAdvanced;
