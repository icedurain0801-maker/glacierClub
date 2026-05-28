import React, { useCallback, useEffect, useState } from 'react';
import { uniqueId } from 'lodash';
import { Chart } from '@antv/g2';

import { accDivision, accMultiply } from '@/utils/helper';

export interface PieDataItem {
    name: string;
    num: number;
}
interface PieChartPropsType {
    data?: Array<PieDataItem>;
}
interface Percent {
    percent: number;
}

const PieChart = React.memo((props: PieChartPropsType) => {
    const { data: originalData } = props;
    const [ id ] = useState(() => uniqueId('pieChart'));
    const [ totalNum, setTotalNum ] = useState(0);
    // 添加百分比
    const addPercent = useCallback(originalData => {
        let dataCopy: Array<PieDataItem & Percent>;
        const total: number = (originalData || []).reduce((pre: number, cur: PieDataItem, index: number) => {
            return pre + cur.num;
        }, 0);
        if (originalData?.length) {
            dataCopy = originalData.map((item: PieDataItem) => {
                return {
                    name: item.name,
                    num: item.num,
                    percent: Number(accDivision(item.num, total).toFixed(4)),
                };
            });
        } else {
            dataCopy = [ { name: '暂无数据', num: 0, percent: 1 } ];
        }
        setTotalNum(total);
        return dataCopy;
    }, []);

    // 渲染图表
    const renderChart = useCallback(() => {
        const data = addPercent(originalData);
        const chart = new Chart({
            container: id,
            autoFit: true,
            height: 350,
            appendPadding: [ 0, 50, 0, 0 ],
        });
        // 新建一个 view 用来单独渲染Annotation
        const innerView = chart.createView();
        chart.coordinate('theta', {
            radius: 0.65,
            innerRadius: 0.6,
        });

        chart.data(data);

        chart.scale('percent', {
            formatter: val => {
                val = val * 100 + '%';
                return val;
            },
        });

        chart.tooltip(false);

        // 声明需要进行自定义图例字段： 'name'
        chart.legend('name', {
            position: 'right', // 配置图例显示位置
            custom: true, // 关键字段，告诉 G2，要使用自定义的图例
            items: data.map((obj, index) => {
                return {
                    name: obj.name, // 对应 itemName
                    value: { num: obj.num, percent: obj.percent, name: obj.name }, // 对应 itemValue
                    marker: {
                        symbol: 'square', // marker 的形状
                        style: {
                            r: 5, // marker 图形半径
                            fill: chart.getTheme().colors10[index], // marker 颜色，使用默认颜色，同图形对应
                        },
                    }, // marker 配置
                };
            }),
            itemValue: {
                style: {
                    fill: '#999',
                }, // 配置 itemValue 样式
                formatter: (val, item) => `${accMultiply(item.value.percent, 100)}%     ${item.value.num}`, // 格式化 itemValue 内容
            },
            offsetX: -50,
            maxItemWidth: 200,
        });

        chart
            .interval()
            .adjust('stack')
            .position('percent')
            .color('name')
            .style({
                fillOpacity: 1,
            })
            .state({
                active: {
                    style: element => {
                        const shape = element.shape;
                        return {
                            lineWidth: 10,
                            stroke: shape.attr('fill'),
                            strokeOpacity: shape.attr('fillOpacity'),
                        };
                    },
                },
            });

        // 移除图例点击过滤交互
        chart.removeInteraction('legend-filter');
        chart.interaction('element-active');

        chart.render();

        function initAnnotation() {
            innerView.annotation().clear(true);
            innerView
                .annotation()
                .text({
                    position: [ '50%', '50%' ],
                    content: '总标签数',
                    style: {
                        fontSize: 16,
                        fill: '#8c8c8c',
                        textAlign: 'center',
                    },
                    offsetY: -20,
                })
                .text({
                    position: [ '50%', '50%' ],
                    content: totalNum.toLocaleString(),
                    style: {
                        fontSize: 28,
                        fill: '#000',
                        textAlign: 'center',
                    },
                    offsetY: 20,
                });
            innerView.render(true);
        }

        initAnnotation();

        return () => chart.destroy();
    }, [ addPercent, id, originalData, totalNum ]);

    useEffect(() => {
        return renderChart(); // 更新组件的时候销毁上一个实例
    }, [ props.data, renderChart ]);

    return <div id={id}></div>;
});
export default PieChart;
