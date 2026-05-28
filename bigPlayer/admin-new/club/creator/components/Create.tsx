import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { Button, DatePicker, Descriptions, Drawer, Form, Input, message, Select, Tag } from 'antd';
import moment from 'moment';
import { debounce } from 'lodash';

import { addCreator, addCreatorTask, editCreatorTask, getCreatorData, getCreatorUserList } from '@/api/club';
import { useContentDialogContainer } from '@/context';
import { disabledRangeTime2 } from '@/utils/helper';

import { BoardPermitOptionsType, BOARD_PERMIT_SEPARATE, CLUB_DEPLOY_VERSION } from '@ts/club';
import { CreateEditDataType, CREATOR_TASK_ENUM, GetCreatorDataResponse, TaskSelection } from '@ts/creator';

import SectionItem from './Sections';

interface CreateProps {
    clubBoardOptions: BoardPermitOptionsType[];
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    data: CreateEditDataType | null;
    visible: boolean;
    onOk?: (data: { boardId: string }) => void;
    onCancel?: () => void;
    pageType: 'list' | 'task';
    userName?: string;
}

export const NAME_MAX_LENGTH = 50;
/** 跳转链接最大长度 */
export const URL_MAX_LENGTH = 200;
const DefaultSections = {
    sort: 0,
};

function Create(props: CreateProps) {
    const [ modalForm ] = Form.useForm();
    const { clubDeployVersion, pageType, data, visible, onOk, onCancel, userName } = props;
    const [ userSelections, setUserSelections ] = useState<{ label: string; value: number }[]>([]);
    const [ copyUserSelections, setCopyUserSelections ] = useState<{ label: string; value: number }[]>([]);
    const [ weeklyUserData, setWeeklyUserData ] = useState<GetCreatorDataResponse | null>(null);
    const allLoadedRef = useRef(true);
    const fetchRef = useRef(0);
    const [ pageIndex, setPageIndex ] = useState(1);
    const [ loading, setLoading ] = useState(false);
    const [ taskTypeSelect, setTaskTypeSelect ] = useState({
        [CREATOR_TASK_ENUM.Post]: false,
        [CREATOR_TASK_ENUM.Comment]: false,
        [CREATOR_TASK_ENUM.Follow]: false,
        [CREATOR_TASK_ENUM.Thumb]: false,
    });
    const isCreate = useMemo(() => !data?.id, [ data ]);
    const getUserDataList = useCallback(async () => {
        if (pageType !== 'list' || !allLoadedRef.current || !data?.boardId) {
            return;
        }
        const { data: resData, total = 0 } = await getCreatorUserList(
            { boardId: data!.boardId.split(BOARD_PERMIT_SEPARATE)[1], pageIndex, pageSize: 50 },
            clubDeployVersion
        );
        if (resData) {
            if (pageIndex * 50 >= total) {
                allLoadedRef.current = false;
            }
            const newArr = resData.map(k => ({ ...k, value: k.userInfoId, label: `${k.nickName}(${k.userInfoId})` }));
            setUserSelections(v => v.concat(newArr));
            setCopyUserSelections(v => v.concat(newArr));
        }
    }, [ clubDeployVersion, data, pageIndex, pageType ]);
    const debounceFetcher = useMemo(() => {
        const loadOptions = (searchCondition: string) => {
            if (!searchCondition.trim()) {
                setUserSelections(copyUserSelections);
                return;
            }
            fetchRef.current += 1;
            const fetchId = fetchRef.current;
            getCreatorUserList(
                {
                    boardId: data!.boardId.split(BOARD_PERMIT_SEPARATE)[1],
                    pageIndex: 1,
                    pageSize: 9999,
                    searchCondition,
                },
                clubDeployVersion
            ).then(({ data }) => {
                if (fetchId !== fetchRef.current) {
                    return;
                }
                if (data?.length) {
                    const newArr = data.map(k => ({ value: k.userInfoId, label: `${k.nickName}(${k.userInfoId})` }));
                    setUserSelections(newArr);
                } else {
                    setUserSelections([]);
                }
            });
        };
        return debounce(loadOptions, 500);
    }, [ data, clubDeployVersion, copyUserSelections ]);
    useEffect(() => {
        if (visible && data) {
            modalForm.resetFields();
            const { boardId, name, taskItems, userId, beginTime, endTime } = data;
            const initValue =
                pageType === 'task'
                    ? { boardId, name, taskItems: taskItems ? taskItems : [ DefaultSections ], beginTime, endTime }
                    : { boardId, userId };
            modalForm.setFieldsValue(initValue);
            if (pageType === 'task') {
                const currentPicker: CREATOR_TASK_ENUM[] = modalForm
                    .getFieldValue([ 'taskItems' ])
                    .map((k: { type: CREATOR_TASK_ENUM }) => k.type);
                TaskSelection.forEach(k => {
                    setTaskTypeSelect(pre => ({
                        ...pre,
                        [k.value as CREATOR_TASK_ENUM]: currentPicker.includes(k.value),
                    }));
                });
            }
        }
    }, [ data, modalForm, pageType, visible ]);

    useEffect(() => {
        getUserDataList();
    }, [ getUserDataList ]);
    const handleSubmit = useCallback(async () => {
        try {
            setLoading(true);
            const { name, beginTime, endTime, userId, taskItems } = await modalForm.validateFields();
            const boardId = data!.boardId.split(BOARD_PERMIT_SEPARATE)[1];
            const query = { boardId };
            let param: any =
                pageType === 'list'
                    ? {
                          userId,
                          boardId,
                          applicant: userName,
                      }
                    : isCreate
                    ? {
                          name,
                          beginTime: moment(beginTime).unix(),
                          endTime: moment(endTime).unix(),
                          taskItems,
                      }
                    : {
                          id: data!.id,
                          name,
                          taskItems,
                      };
            const { code, message: msg } =
                pageType === 'list'
                    ? await addCreator(param, clubDeployVersion)
                    : isCreate
                    ? await addCreatorTask(query, param, clubDeployVersion)
                    : await editCreatorTask(query, param, clubDeployVersion);
            setLoading(false);
            if (code === 0) {
                onOk?.(query);
                message.success(`${isCreate ? '新建' : '编辑'}成功`);
            } else {
                message.error(msg);
            }
        } catch (err) {
            console.log('err', err);
            setLoading(false);
        }
    }, [ clubDeployVersion, data, isCreate, modalForm, onOk, pageType, userName ]);

    return (
        <Drawer
            getContainer={useContentDialogContainer()}
            width={900}
            title={(isCreate ? '新增' : '编辑') + (pageType === 'list' ? '创作者' : '创作任务')}
            visible={visible}
            onClose={() => {
                allLoadedRef.current = true;
                setWeeklyUserData(null);
                setUserSelections([]);
                setCopyUserSelections([]);
                setPageIndex(1);
                onCancel?.();
            }}
            footer={[
                <Button
                    style={{ float: 'right', marginRight: 16 }}
                    key="0"
                    type="primary"
                    loading={loading}
                    onClick={handleSubmit}
                >
                    提交
                </Button>,
            ]}
        >
            <Form form={modalForm} labelCol={{ span: 4 }}>
                <Form.Item name="boardId" label="所属版块" wrapperCol={{ span: 10 }} required>
                    <Tag color="cyan" style={{ borderRadius: 8, fontSize: 14, padding: '4px 9px' }}>
                        {data?.boardName}
                    </Tag>
                </Form.Item>
                {pageType === 'task' ? (
                    <>
                        <Form.Item
                            name="name"
                            label="任务名称"
                            required
                            rules={[ { required: true, message: '创作任务不能为空' } ]}
                            normalize={v => v?.trim()}
                        >
                            <Input style={{ width: 280 }} placeholder="输入任务名称" />
                        </Form.Item>
                        <Form.Item
                            name="beginTime"
                            label="开始时间"
                            required
                            rules={[
                                {
                                    validator: (_, value) => {
                                        if (!value) {
                                            return Promise.reject('请选择开始时间');
                                        }
                                        if (isCreate && moment(value).valueOf() < moment().valueOf()) {
                                            return Promise.reject('不应早于当前时间');
                                        }
                                        return Promise.resolve();
                                    },
                                },
                            ]}
                        >
                            <DatePicker
                                disabledDate={date => {
                                    return date.isBefore(moment(), 'date');
                                }}
                                format="YYYY-MM-DD HH:mm:ss"
                                disabled={!isCreate}
                                showTime={{
                                    hideDisabledOptions: true,
                                }}
                                disabledTime={date => disabledRangeTime2(date)}
                            />
                        </Form.Item>
                        <Form.Item
                            name="endTime"
                            label="结束时间"
                            required
                            rules={[
                                {
                                    validator: (_, value) => {
                                        if (!value) {
                                            return Promise.reject('请选择结束时间');
                                        }
                                        if (isCreate && moment(value).valueOf() < moment().valueOf()) {
                                            return Promise.reject('不应早于当前时间');
                                        }
                                        const beginTime = modalForm.getFieldValue('beginTime');
                                        if (beginTime && moment(value).valueOf() < moment(beginTime).valueOf()) {
                                            return Promise.reject('不应早于开始时间');
                                        }
                                        return Promise.resolve();
                                    },
                                },
                            ]}
                        >
                            <DatePicker
                                showTime={{ hideDisabledOptions: true }}
                                format="YYYY-MM-DD HH:mm:ss"
                                disabled={!isCreate}
                                onChange={() => {
                                    modalForm.validateFields([ 'beginTime' ]);
                                }}
                                disabledDate={date => {
                                    return date.isBefore(moment(), 'date');
                                }}
                                disabledTime={date => disabledRangeTime2(date)}
                            />
                        </Form.Item>
                        <Form.Item label="任务设置" required>
                            <Form.List name="taskItems">
                                {(fields, { add, remove, move }) => {
                                    return (
                                        <SectionItem
                                            clubDeployVersion={clubDeployVersion}
                                            form={modalForm}
                                            boardId={data?.boardId ?? ''}
                                            users={data?.users ?? []}
                                            isCreate={isCreate}
                                            fields={fields}
                                            add={add}
                                            remove={remove}
                                            setTaskTypeSelect={setTaskTypeSelect}
                                            taskTypeSelect={taskTypeSelect}
                                            move={move}
                                        />
                                    );
                                }}
                            </Form.List>
                        </Form.Item>
                    </>
                ) : (
                    <>
                        <Form.Item
                            name="userId"
                            label="玩家选择"
                            required
                            rules={[ { required: true, message: '请选择玩家' } ]}
                        >
                            <Select
                                style={{ width: 280 }}
                                showSearch
                                filterOption={false}
                                onSearch={debounceFetcher}
                                onChange={async v => {
                                    const passportId = (copyUserSelections as any[]).find(k => k.value === v).userId;
                                    const { data } = await getCreatorData({ passportId }, clubDeployVersion);
                                    if (data) {
                                        setWeeklyUserData(data);
                                    } else {
                                        setWeeklyUserData(null);
                                    }
                                }}
                                allowClear
                                onFocus={() => {
                                    setUserSelections(copyUserSelections);
                                }}
                                onPopupScroll={({ target }: { target: any }) => {
                                    const { clientHeight, scrollTop, scrollHeight } = target;
                                    if (parseInt(scrollTop) + clientHeight >= scrollHeight - 20) {
                                        if (allLoadedRef.current) {
                                            setPageIndex(v => ++v);
                                        }
                                    }
                                }}
                            >
                                {userSelections?.map(item => (
                                    <Select.Option value={item.value} key={item.value}>
                                        {item.label}
                                    </Select.Option>
                                ))}
                            </Select>
                        </Form.Item>
                        <Form.Item name="data" label="玩家数据（近7天）">
                            <Descriptions column={5} bordered layout="vertical">
                                <Descriptions.Item label="累计点赞数">
                                    {weeklyUserData?.likesCount ?? ''}
                                </Descriptions.Item>
                                <Descriptions.Item label="累计评论数">
                                    {weeklyUserData?.commentsCount ?? ''}
                                </Descriptions.Item>
                                <Descriptions.Item label="累计粉丝数">
                                    {weeklyUserData?.followersCount ?? ''}
                                </Descriptions.Item>
                                <Descriptions.Item label="累计发帖数">
                                    {weeklyUserData?.postCount ?? ''}
                                </Descriptions.Item>
                                <Descriptions.Item label="累计浏览量">
                                    {weeklyUserData?.viewsCount ?? ''}
                                </Descriptions.Item>
                            </Descriptions>
                        </Form.Item>
                    </>
                )}
            </Form>
        </Drawer>
    );
}
export default memo(Create);
