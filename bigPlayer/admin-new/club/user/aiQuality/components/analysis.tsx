import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Spin, Tooltip } from 'antd';
import { marked } from 'marked';

import { getQualityAnalysis, getQualityStatistic } from '@/api/clubQuality';
import BlockHeader from '@/components/BlockHeader';

import {
    QUALITY_TYPE,
    QualityAnalysisParams,
    QualityBaseParams,
    QualityQueryTypeMap,
    QualityStatistic,
} from '@ts/clubQuality';
import { BOARD_PERMIT_SEPARATE, CLUB_DEPLOY_VERSION } from '@ts/club';

import { useAiQualityContext } from '../context';
import './analysis.less';

interface MetricItem {
    title: string;
    value: string;
    trendText?: string;
    trendType?: 'up' | 'down' | 'flat';
}

interface StatisticItem {
    title: string;
    value: string;
    bars: number[];
    tooltipFormatter?: (value: number) => string;
}

const EMPTY_STATISTIC: QualityStatistic = {
    list: [],
    summary: {
        totalRecommendations: 0,
        totalScores: 0,
        totalRecommendationsRate: 0,
        recommendationClickRate: 0,
        recommendationClickRateChange: 0,
        interactionConversionRate: 0,
        interactionConversionRateChange: 0,
        negativeFeedbackRate: 0,
        negativeFeedbackRateChange: 0,
        mediumScoreRatio: 0,
        mediumScoreRatioChange: 0,
        lowScoreRatio: 0,
        lowScoreRatioChange: 0,
    },
};

function parseBoardValue(boardValue?: string) {
    if (!boardValue) {
        return { clubDeployVersion: undefined, boardId: undefined };
    }

    const [ clubDeployVersion, boardId ] = boardValue.split(BOARD_PERMIT_SEPARATE);

    return {
        clubDeployVersion: clubDeployVersion as CLUB_DEPLOY_VERSION | undefined,
        boardId,
    };
}

function formatNumber(value?: number | null) {
    if (value == null || Number.isNaN(Number(value))) {
        return '--';
    }

    return Number(value).toLocaleString();
}

function formatPercent(value?: number | null, digits = 1) {
    if (value == null || Number.isNaN(Number(value))) {
        return '--';
    }

    const normalizedValue = Math.abs(Number(value)) <= 1 ? Number(value) * 100 : Number(value);
    const fixedValue = normalizedValue
        .toFixed(digits)
        .replace(/\.0+$/, '')
        .replace(/(\.\d*[1-9])0+$/, '$1');
    return `${fixedValue}%`;
}

function getTrendMeta(value?: number | null) {
    if (value == null || Number.isNaN(Number(value))) {
        return {};
    }

    if (Number(value) > 0) {
        return {
            trendText: `↑ ${formatPercent(Math.abs(Number(value)))}`,
            trendType: 'up' as const,
        };
    }

    if (Number(value) < 0) {
        return {
            trendText: `↓ ${formatPercent(Math.abs(Number(value)))}`,
            trendType: 'down' as const,
        };
    }

    return {
        trendText: '0%',
        trendType: 'flat' as const,
    };
}

function buildQualityAnalysisParams(statistic: QualityStatistic, tableType: QUALITY_TYPE): QualityAnalysisParams {
    const { list, summary } = statistic;
    const latestStatistic = list[list.length - 1];
    const pendingVerification = latestStatistic?.pendingVerificationCount ?? 0;
    const {
        recommendationClickRate = 0,
        recommendationClickRateChange = 0,
        interactionConversionRate = 0,
        interactionConversionRateChange = 0,
        negativeFeedbackRate = 0,
        negativeFeedbackRateChange = 0,
        mediumScoreRatio = 0,
        mediumScoreRatioChange = 0,
        lowScoreRatio = 0,
        lowScoreRatioChange = 0,
        totalRecommendations = 0,
    } = summary;

    return {
        recommendationClickRate,
        recommendationClickRateChange,
        interactionConversionRate,
        interactionConversionRateChange,
        negativeFeedbackRate,
        negativeFeedbackRateChange,
        accuracyRate: recommendationClickRate,
        mediumScoreRatio,
        mediumScoreRatioChange,
        lowScoreRatio,
        lowScoreRatioChange,
        totalRecommendations,
        pendingVerification,
        pendingVerificationRatio: totalRecommendations > 0 ? pendingVerification / totalRecommendations : 0,
        type: QualityQueryTypeMap[tableType],
    };
}

function MetricCard(props: { item: MetricItem }) {
    const { item } = props;

    return (
        <div className="club-ai-quality-analysis__metric-card">
            <div className="club-ai-quality-analysis__metric-title">
                <span>{item.title}</span>
            </div>
            <div className="club-ai-quality-analysis__metric-value">{item.value}</div>
            {item.trendText ? (
                <div
                    className={`club-ai-quality-analysis__metric-trend${
                        item.trendType ? ` club-ai-quality-analysis__metric-trend_${item.trendType}` : ''
                    }`}
                >
                    {item.trendText}
                </div>
            ) : null}
        </div>
    );
}

function MiniBarChart(props: { values: number[]; tooltipFormatter?: (value: number) => string }) {
    const heights = useMemo(() => {
        if (!props.values.length) {
            return [];
        }

        const maxValue = Math.max(...props.values, 0);
        return props.values.map(item => {
            if (maxValue <= 0) {
                return 8;
            }
            return Math.max(8, Math.round((item / maxValue) * 54));
        });
    }, [ props.values ]);

    return (
        <div className="club-ai-quality-analysis__mini-bars">
            {heights.map((height, index) => (
                <Tooltip
                    key={`${props.values[index]}-${index}`}
                    title={props.tooltipFormatter?.(props.values[index]) ?? formatNumber(props.values[index])}
                >
                    <span className="club-ai-quality-analysis__mini-bar" style={{ height }} />
                </Tooltip>
            ))}
        </div>
    );
}

function StatisticCard(props: { item: StatisticItem }) {
    const { item } = props;

    return (
        <div className="club-ai-quality-analysis__stat-card">
            <div className="club-ai-quality-analysis__stat-title">
                <span>{item.title}</span>
            </div>
            <div className="club-ai-quality-analysis__stat-value">{item.value}</div>
            <MiniBarChart values={item.bars} tooltipFormatter={item.tooltipFormatter} />
        </div>
    );
}

function Analysis() {
    const { tableType, queryValues, queryVersion } = useAiQualityContext();
    const [ statistic, setStatistic ] = useState<QualityStatistic>(EMPTY_STATISTIC);
    const [ loading, setLoading ] = useState(false);
    const [ analysisContent, setAnalysisContent ] = useState('');
    const [ analysisLoading, setAnalysisLoading ] = useState(false);
    const latestQueryValuesRef = useRef(queryValues);
    const requestIdRef = useRef(0);

    useEffect(() => {
        latestQueryValuesRef.current = queryValues;
    }, [ queryValues ]);

    const fetchAnalysisContent = useCallback(
        async (requestId: number, boardId: string, clubDeployVersion: CLUB_DEPLOY_VERSION, data: QualityStatistic) => {
            setAnalysisLoading(true);
            try {
                const analysisRes = await getQualityAnalysis(
                    { boardId },
                    buildQualityAnalysisParams(data, tableType),
                    clubDeployVersion
                );

                if (requestIdRef.current !== requestId) {
                    return;
                }

                setAnalysisContent(analysisRes.code === 0 ? analysisRes.data || '' : '');
            } finally {
                if (requestIdRef.current === requestId) {
                    setAnalysisLoading(false);
                }
            }
        },
        [ tableType ]
    );

    const fetchStatistic = useCallback(async () => {
        const latestQueryValues = latestQueryValuesRef.current;
        const { clubDeployVersion, boardId } = parseBoardValue(latestQueryValues.boardId);
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;

        if (!clubDeployVersion || !boardId) {
            setStatistic(EMPTY_STATISTIC);
            setAnalysisContent('');
            setAnalysisLoading(false);
            return;
        }

        setLoading(true);
        try {
            const params: QualityBaseParams = {
                boardId,
                type: QualityQueryTypeMap[tableType],
                ...(latestQueryValues.checkLevel ? { checkLevel: Number(latestQueryValues.checkLevel) as any } : {}),
                ...(latestQueryValues.startTime != null ? { startTime: latestQueryValues.startTime } : {}),
                ...(latestQueryValues.endTime != null ? { endTime: latestQueryValues.endTime } : {}),
            };

            const { code, data } = await getQualityStatistic(params, clubDeployVersion);
            if (requestIdRef.current !== requestId) {
                return;
            }

            if (code === 0 && data) {
                setStatistic(data);
                await fetchAnalysisContent(requestId, boardId, clubDeployVersion, data);
            } else {
                setStatistic(EMPTY_STATISTIC);
                setAnalysisContent('');
                setAnalysisLoading(false);
            }
        } finally {
            if (requestIdRef.current === requestId) {
                setLoading(false);
            }
        }
    }, [ fetchAnalysisContent, tableType ]);

    useEffect(() => {
        fetchStatistic();
    }, [ fetchStatistic, queryVersion ]);

    const { list, summary } = statistic;
    const analysisHtml = useMemo(() => marked.parse(analysisContent || ''), [ analysisContent ]);

    const recommendMetricList = useMemo<MetricItem[]>(() => {
        if (tableType === QUALITY_TYPE.Post) {
            return [
                {
                    title: '推荐点击率',
                    value: formatPercent(summary.recommendationClickRate),
                    ...getTrendMeta(summary.recommendationClickRateChange),
                },
                {
                    title: '互动转化率',
                    value: formatPercent(summary.interactionConversionRate),
                    ...getTrendMeta(summary.interactionConversionRateChange),
                },
                {
                    title: '负反馈率',
                    value: formatPercent(summary.negativeFeedbackRate),
                    ...getTrendMeta(summary.negativeFeedbackRateChange),
                },
            ];
        }

        return [
            {
                title: '中等评分占比',
                value: formatPercent(summary.mediumScoreRatio),
                ...getTrendMeta(summary.mediumScoreRatioChange),
            },
            {
                title: '低等评分占比',
                value: formatPercent(summary.lowScoreRatio),
                ...getTrendMeta(summary.lowScoreRatioChange),
            },
        ];
    }, [ summary, tableType ]);

    const verifyMetricList = useMemo<MetricItem[]>(
        () => [
            {
                title: '中等评分占比',
                value: formatPercent(summary.mediumScoreRatio),
                ...getTrendMeta(summary.mediumScoreRatioChange),
            },
            {
                title: '低等评分占比',
                value: formatPercent(summary.lowScoreRatio),
                ...getTrendMeta(summary.lowScoreRatioChange),
            },
        ],
        [ summary ]
    );

    const statisticCardList = useMemo<StatisticItem[]>(
        () => [
            {
                title: '总推荐数量',
                value: formatNumber(summary.totalRecommendations),
                bars: list.map(item => item.totalRecommendations),
                tooltipFormatter: value => formatNumber(value),
            },
            {
                title: '总核验数量',
                value: formatNumber(summary.totalScores ?? 0),
                bars: list.map(item => item.mediumScores + item.lowScores),
                tooltipFormatter: value => formatNumber(value),
            },
            {
                title: '核验率占比',
                value: formatPercent(summary.totalRecommendationsRate),
                bars: list.map(item => item.verificationRatio),
                tooltipFormatter: value => formatPercent(value),
            },
        ],
        [ list, summary.totalRecommendations, summary.totalRecommendationsRate, summary.totalScores ]
    );

    const showVerifySection = tableType === QUALITY_TYPE.Post;

    return (
        <Spin spinning={loading}>
            <div className="q1-content__main q1-content__main_white club-ai-quality-analysis">
                <BlockHeader title="AI总结" hasBottom />
                <Spin spinning={analysisLoading}>
                    <div className="club-ai-quality-analysis__summary">
                        {analysisContent ? (
                            <div
                                className="club-ai-quality-analysis__summary-content"
                                dangerouslySetInnerHTML={{ __html: analysisHtml }}
                            />
                        ) : (
                            <div className="club-ai-quality-analysis__summary-empty">暂无AI总结</div>
                        )}
                    </div>
                </Spin>

                <BlockHeader title="推荐系统效果" hasBottom />
                <div
                    className={`club-ai-quality-analysis__metric-grid${
                        recommendMetricList.length === 2 ? ' club-ai-quality-analysis__metric-grid_two' : ''
                    }`}
                >
                    {recommendMetricList.map(item => (
                        <MetricCard key={item.title} item={item} />
                    ))}
                </div>

                {showVerifySection ? (
                    <>
                        <BlockHeader title="核验数据统计" hasBottom />
                        <div className="club-ai-quality-analysis__metric-grid club-ai-quality-analysis__metric-grid_two">
                            {verifyMetricList.map(item => (
                                <MetricCard key={item.title} item={item} />
                            ))}
                        </div>
                    </>
                ) : null}

                <BlockHeader title="数据统计" hasBottom />
                <div className="club-ai-quality-analysis__stat-grid">
                    {statisticCardList.map(item => (
                        <StatisticCard key={item.title} item={item} />
                    ))}
                </div>
            </div>
        </Spin>
    );
}

export default Analysis;
