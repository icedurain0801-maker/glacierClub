import React, { memo, useCallback, useMemo, useState } from 'react';
import { Button, Form, FormInstance, InputNumber, Select } from 'antd';
import { PlusCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { isEqual } from 'lodash';
import type { FormListFieldData, FormListOperation } from 'antd/es/form/FormList';
import { arrayMoveImmutable as arrayMove } from 'array-move';

import SortableTable from '@/components/q1Table/sortableTable';
import { useIsEqualState } from '@/context';
import { normalRuleValidator } from '@/utils/lib';

import { CLUB_DEPLOY_VERSION } from '@ts/club';
import { CREATOR_TASK_ENUM, TaskSelection } from '@ts/creator';

import './sections.less';

export const DefaultSections = {
    sort: 0,
};

interface SectionItemProps {
    isCreate?: boolean;
    submitTime?: number;
    form: FormInstance;
    fields: FormListFieldData[];
    add: FormListOperation['add'];
    remove: FormListOperation['remove'];
    move: FormListOperation['move'];
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    boardId: string;
    users: { value: number; label: string }[];
    taskTypeSelect: { [k in CREATOR_TASK_ENUM]: boolean };
    setTaskTypeSelect: React.Dispatch<
        React.SetStateAction<
            {
                [k in CREATOR_TASK_ENUM]: boolean;
            }
        >
    >;
}
function SectionItem(props: SectionItemProps) {
    const { form, isCreate, fields, setTaskTypeSelect, taskTypeSelect } = props;
    const equaledFields = useIsEqualState(fields, isEqual);
    const [ handleRemoveTime, setHandleRemoveTime ] = useState(Date.now());

    const handleAdd = useCallback(async () => {
        const sections = form.getFieldValue('taskItems') || [];
        form.setFields([ { name: 'taskItems', value: [ ...sections, { ...DefaultSections, sort: sections.length } ] } ]);
        setHandleRemoveTime(Date.now());
    }, [ form ]);
    const removeSection = useCallback(
        index => {
            const sections = form.getFieldValue('taskItems');
            const type = sections.find((_: never, xi: number) => xi === index).type;
            if (type != null) {
                setTaskTypeSelect(pre => ({ ...pre, [type as CREATOR_TASK_ENUM]: false }));
            }
            form.setFields([ { name: 'taskItems', value: sections.filter((_: never, xi: number) => xi !== index) } ]);
            setHandleRemoveTime(Date.now());
        },
        [ form, setTaskTypeSelect ]
    );

    const onChangeSort = useCallback(
        ({ oldIndex, newIndex }) => {
            const sections = form.getFieldValue('taskItems');
            form.setFields([
                {
                    name: 'taskItems',
                    value: arrayMove(sections, oldIndex, newIndex).map((v: any, i) => ({ ...v, sort: i })),
                },
            ]);
            setHandleRemoveTime(Date.now());
        },
        [ form ]
    );
    return useMemo(() => {
        const columns: ColumnsType<FormListFieldData> = [
            {
                key: 'type',
                title: '任务类型',
                align: 'center',
                render: (v, record, index) => {
                    return (
                        <Form.Item
                            {...record}
                            name={[ record.name, 'type' ]}
                            fieldKey={[ record.fieldKey, 'type' ]}
                            key={record.key + 'type'}
                            rules={normalRuleValidator('请选择')}
                        >
                            <Select
                                style={{ width: 100 }}
                                placeholder="请选择"
                                disabled={!isCreate}
                                onChange={v => {
                                    const currentPicker: CREATOR_TASK_ENUM[] = form
                                        .getFieldValue([ 'taskItems' ])
                                        .map((k: { type: CREATOR_TASK_ENUM }) => k.type);
                                    TaskSelection.forEach(k => {
                                        setTaskTypeSelect(pre => ({
                                            ...pre,
                                            [k.value as CREATOR_TASK_ENUM]: currentPicker.includes(k.value),
                                        }));
                                    });
                                }}
                            >
                                {TaskSelection.map(k => (
                                    <Select.Option key={k.value} value={k.value} disabled={taskTypeSelect[k.value]}>
                                        {k.label}
                                    </Select.Option>
                                ))}
                            </Select>
                        </Form.Item>
                    );
                },
            },
            {
                key: 'requirement',
                title: '达成要求',
                align: 'center',
                render: (v, record, index) => {
                    return (
                        <>
                            <Form.Item
                                {...record}
                                name={[ record.name, 'requirement' ]}
                                fieldKey={[ record.fieldKey, 'requirement' ]}
                                key={record.key + 'requirement'}
                                style={{ display: 'inline-block' }}
                                rules={normalRuleValidator('请输入')}
                            >
                                <InputNumber min={1} precision={0} style={{ marginRight: 6 }} disabled={!isCreate} />
                            </Form.Item>
                            <div className="center-font">次</div>
                        </>
                    );
                },
            },
            {
                key: 'reward',
                title: '奖励',
                align: 'center',
                render: (v, record, index) => {
                    return (
                        <>
                            <Form.Item
                                {...record}
                                name={[ record.name, 'reward' ]}
                                fieldKey={[ record.fieldKey, 'reward' ]}
                                key={record.key + 'reward'}
                                rules={normalRuleValidator('请输入')}
                                style={{ display: 'inline-block' }}
                            >
                                <InputNumber min={0} precision={0} style={{ marginRight: 6 }} />
                            </Form.Item>
                            <div className="center-font">经验值</div>
                        </>
                    );
                },
            },
            ...((isCreate
                ? [
                      {
                          key: 'ops_action',
                          title: '操作',
                          align: 'center',
                          width: 61,
                          render: (field: never, record: never, index: number) => {
                              return (
                                  <>
                                      {equaledFields?.length > 1 ? (
                                          <Button danger type="link" onClick={() => removeSection(index)}>
                                              移除
                                          </Button>
                                      ) : null}
                                  </>
                              );
                          },
                      },
                  ]
                : []) as any),
        ];

        return (
            <div className="club-creator-sections">
                <SortableTable
                    key={handleRemoveTime}
                    helperClass="row-dragging-club__creator"
                    className="form-list"
                    dataSource={equaledFields}
                    onChangeSort={onChangeSort}
                    columns={columns}
                    pagination={false}
                    size="small"
                    sortableDisabled={!isCreate}
                    rowKey="key"
                    footer={() =>
                        equaledFields?.length < 3 && isCreate ? (
                            <Button block onClick={handleAdd} icon={<PlusCircleOutlined />}>
                                添加任务
                            </Button>
                        ) : null
                    }
                />
            </div>
        );
    }, [
        handleRemoveTime,
        equaledFields,
        onChangeSort,
        isCreate,
        form,
        setTaskTypeSelect,
        taskTypeSelect,
        removeSection,
        handleAdd,
    ]);
}

export default memo(SectionItem);
