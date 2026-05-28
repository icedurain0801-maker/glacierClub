import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DeleteOutlined, ExclamationCircleOutlined, PlusCircleOutlined } from '@ant-design/icons';
import { Button, Form, Input, message, Modal } from 'antd';
import { ColumnsType } from 'antd/es/table';
import type { FormListFieldData } from 'antd/es/form/FormList';
import { StoreValue } from 'antd/es/form/interface';
import { OptionsType } from 'rc-select/lib/interface';
import { v4 as uuidv4 } from 'uuid';
import { keyBy } from 'lodash';
import { ValidateErrorEntity } from 'rc-field-form/es/interface';

import SortableTable from '@/components/q1Table/sortableTable';
import { batchSyncEncyclopediaGroup, checkEncyclopediaNameExists, existsEncyclopedia } from '@/api/club';

import { CLUB_DEPLOY_VERSION } from '@ts/club';
interface ColumnsItem {
    sort: number;
    name: string;
    id?: number | string; // string表示临时id
}
interface PropsType {
    userName: string;
    boardId: number;
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    visible: boolean;
    setVisible: (visible: boolean) => void;
    list: ColumnsItem[];
    setList: (list: OptionsType) => void;
}
export const ManageCyclopedia = function ManageCyclopedia(props: PropsType) {
    const { userName, boardId, clubDeployVersion, visible, setVisible, list, setList } = props;
    const dataSource = useRef<FormListFieldData[]>([]);
    const initListDict = useRef<Record<string, ColumnsItem>>({});
    const [ manageCyclopediaForm ] = Form.useForm();
    const [ okLoading, setOkLoading ] = useState(false);

    const manageCyclopediaClose = useCallback(() => {
        setVisible(false);
    }, [ setVisible ]);

    // 定位form错误位置
    const locationError = useCallback((errorInfo: ValidateErrorEntity<any>) => {
        if (!errorInfo?.errorFields?.length) {
            return;
        }
        const sortErrorFieldsList = errorInfo?.errorFields.sort((a, b) => Number(a.name[1]) - Number(b.name[1]));
        const trategySettingsFirstKeyList = [ 'columns' ];
        const parentErrItem = sortErrorFieldsList.find(
            item => trategySettingsFirstKeyList.includes(item.name[0] as string) && !!item.name[2]
        );
        if (parentErrItem && parentErrItem.name?.length === 3) {
            const key = parentErrItem.name[1];
            const el = document.querySelector(`#manage-cyclopedia-form [data-row-key="${key}"]`);
            if (el) {
                el.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'center',
                });
            }
        }
    }, []);

    const manageCyclopediaOk = useCallback(async () => {
        try {
            setOkLoading(true);
            const { columns } = await manageCyclopediaForm.validateFields();
            if (!columns?.length) {
                return message.error('请新建攻略组');
            }
            const { code, message: msg, data } = await batchSyncEncyclopediaGroup(
                boardId,
                {
                    boardId,
                    creator: userName,
                    groups: columns.map((x: ColumnsItem) => ({
                        name: x.name,
                        id: typeof x.id === 'number' ? x.id : 0,
                    })),
                },
                clubDeployVersion
            );
            if (code === 0) {
                setList((data || []).map(item => ({ label: item.name, value: item.id })));
                setVisible(false);
            } else {
                message.error(msg);
            }
        } catch (error) {
            locationError(error as ValidateErrorEntity<any>);
        } finally {
            setOkLoading(false);
        }
    }, [ boardId, clubDeployVersion, locationError, manageCyclopediaForm, setList, setVisible, userName ]);
    const addHandle = useCallback(
        (add: (defaultValue?: StoreValue, insertIndex?: number) => void) => {
            try {
                let sections = manageCyclopediaForm.getFieldValue('columns');
                add({
                    sort: sections?.length || 0,
                    name: '',
                    id: uuidv4(),
                });
                setTimeout(() => {
                    const dom = document.querySelector(`.manage-cyclopedia-sortable-table .ant-table-body`);
                    if (dom) {
                        dom.scrollTop = dom.scrollHeight;
                    }
                }, 0);
            } catch (error) {
                console.log(error);
            }
        },
        [ manageCyclopediaForm ]
    );

    // 删除之后判断是否需要对同名数据进行赋值接口id
    const delAssignHandle = useCallback(() => {
        const columns = manageCyclopediaForm.getFieldsValue()['columns'];
        let assignObj: Record<string, ColumnsItem> = {};
        let newColumns = [ ...columns ];
        newColumns.forEach(item => {
            if (!assignObj[item.name] && initListDict.current?.[item.name]) {
                item.id = initListDict.current[item.name].id;
                assignObj[item.name] = item;
            }
        });
        manageCyclopediaForm.setFieldsValue({ columns: newColumns });
    }, [ manageCyclopediaForm ]);

    // 判断攻略组是否含有一个以上的攻略
    const delCheck = useCallback(
        async (remove, i) => {
            const rowData = manageCyclopediaForm.getFieldsValue()['columns']?.[i];
            if (typeof rowData.id === 'number') {
                const { code, message: msg, data } = await existsEncyclopedia(
                    { groupId: rowData.id, boardId },
                    clubDeployVersion
                );
                if (code === 0) {
                    if (data) {
                        return Modal.confirm({
                            title: 'Confirm',
                            icon: <ExclamationCircleOutlined />,
                            content: '当前攻略组存在攻略项，确认删除吗，删除后不可恢复？',
                            okText: '确认',
                            cancelText: '取消',
                            onOk: () => {
                                remove(i);
                                delAssignHandle();
                            },
                        });
                    }
                } else {
                    return message.error(msg);
                }
            }
            remove(i);
        },
        [ boardId, clubDeployVersion, delAssignHandle, manageCyclopediaForm ]
    );

    // 唯一性校验
    const validateName = useCallback(
        async (value, i) => {
            try {
                setOkLoading(true);
                const columns: ColumnsItem[] = manageCyclopediaForm.getFieldsValue()['columns'];
                if (columns.some((x, cI) => i !== cI && x.name === value)) {
                    return Promise.reject('名称不可重复');
                }
                const id = columns[i]?.id;
                const { code, message: msg, data } = await checkEncyclopediaNameExists(
                    { boardId, id: typeof id === 'number' ? id : 0, name: value },
                    clubDeployVersion
                );
                if (code === 0) {
                    return data ? Promise.reject('名称不可重复') : Promise.resolve();
                } else {
                    return Promise.reject(msg);
                }
            } catch (error) {
                return Promise.reject(JSON.stringify(error));
            } finally {
                setOkLoading(false);
            }
        },
        [ boardId, clubDeployVersion, manageCyclopediaForm ]
    );
    // 新建的行数据，名称和已新建的名称一样时，重新进行赋值id
    // 判断相同名称时，是否需要赋值id数据
    const sameNameChange = useCallback(
        (value, index) => {
            const columns: ColumnsItem[] = manageCyclopediaForm.getFieldsValue()['columns'];
            const inexistence = !columns.some(x => x.name === value && typeof x.id === 'number');
            const item = columns[index];
            const initFindItem = initListDict.current?.[value];
            // 已删除接口同名数据，重新新建非数字类型id且存在相同名称时
            if (inexistence && typeof item.id !== 'number' && initFindItem) {
                manageCyclopediaForm.setFields([ { name: [ 'columns', index ], value: { ...item, id: initFindItem.id } } ]);
            }
        },
        [ manageCyclopediaForm ]
    );

    const columnsFn = useCallback(
        ({ remove }): ColumnsType<FormListFieldData & Omit<ColumnsItem, 'id'>> => {
            return [
                {
                    title: '攻略组名称',
                    key: 'name',
                    render: (v, record) => {
                        return (
                            <Form.Item
                                {...record}
                                style={{ marginBottom: 0 }}
                                name={[ record.name, 'name' ]}
                                fieldKey={[ record.fieldKey, 'name' ]}
                                normalize={val => val?.trim()}
                                validateTrigger={[ 'onBlur' ]}
                                rules={[
                                    {
                                        validator: async (rule, value, callback) => {
                                            if (!value) {
                                                return Promise.reject('攻略组名称不能为空');
                                            } else if (value.trim().length < 2) {
                                                return Promise.reject('攻略组名称不能少于2个字符');
                                            } else if (!/^[\u4e00-\u9fa5a-zA-Z0-9\s_]+$/.test(value)) {
                                                return Promise.reject('仅允许中文、英文、数字、空格、下划线');
                                            }
                                            await validateName(value, record.sort);
                                            return Promise.resolve();
                                        },
                                    },
                                ]}
                            >
                                <Input
                                    maxLength={20}
                                    minLength={2}
                                    allowClear
                                    onChange={e => {
                                        sameNameChange(e.target.value, record.sort);
                                    }}
                                />
                            </Form.Item>
                        );
                    },
                },
                {
                    title: '操作',
                    key: 'ops_action',
                    width: 60,
                    render: (v, record, i) => {
                        return (
                            <>
                                {dataSource.current?.length > 1 ? (
                                    <Button
                                        type="link"
                                        danger
                                        onClick={() => {
                                            delCheck(remove, i);
                                        }}
                                        icon={<DeleteOutlined />}
                                    />
                                ) : null}
                            </>
                        );
                    },
                },
            ];
        },
        [ delCheck, sameNameChange, validateName ]
    );

    useEffect(() => {
        if (visible) {
            initListDict.current = keyBy(list, 'name');
            manageCyclopediaForm.setFields([ { name: 'columns', value: list } ]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ visible ]);

    return (
        <div className="manage-cyclopedia-page">
            <Modal
                title="管理攻略组"
                visible={visible}
                onCancel={manageCyclopediaClose}
                footer={
                    <>
                        <Button onClick={manageCyclopediaClose} loading={okLoading}>
                            取消
                        </Button>
                        <Button onClick={manageCyclopediaOk} type="primary" loading={okLoading}>
                            确定
                        </Button>
                    </>
                }
            >
                <Form form={manageCyclopediaForm} name="manage-cyclopedia-form">
                    <Form.List name="columns">
                        {(fields, { add, remove, move }) => {
                            dataSource.current = fields;
                            return (
                                <SortableTable
                                    key="manage-cyclopedia-sortable-table"
                                    helperClass="row-dragging-club__pedia"
                                    className="manage-cyclopedia-sortable-table"
                                    dataSource={dataSource.current}
                                    onChangeSort={({ oldIndex, newIndex }) => move(oldIndex, newIndex)}
                                    columns={columnsFn({ add, remove, move })}
                                    pagination={false}
                                    size="small"
                                    rowKey="key"
                                    scroll={fields.length > 5 ? { y: 245 } : {}}
                                    footer={() => {
                                        return (
                                            <Button block onClick={() => addHandle(add)} icon={<PlusCircleOutlined />}>
                                                新建攻略组
                                            </Button>
                                        );
                                    }}
                                />
                            );
                        }}
                    </Form.List>
                </Form>
            </Modal>
        </div>
    );
};
