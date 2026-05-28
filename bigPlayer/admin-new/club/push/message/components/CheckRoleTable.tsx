import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Table, Input, Button, Space, Spin } from 'antd';
import Highlighter from 'react-highlight-words';
import { CheckCircleOutlined, CloseOutlined, SearchOutlined } from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';

import { useTableAdaptHeight } from '@/utils/tableAdapt';

import { OMIT_TABLE_HEIGHT } from '@ts/clientModel';
import { SenderList, CheckSenderList } from '@ts/club';

interface CheckRoleTableProps {
    data: ICheckRoleTableData[];
    checkedResultLoading: boolean;
    isEdit: boolean | undefined;
}
export interface ICheckRoleTableData extends SenderList {
    result: boolean;
    /** 自定义展示文字 */
    msg?: React.ReactNode;
}

export default function CheckRoleTable({ data, checkedResultLoading = false, isEdit = false }: CheckRoleTableProps) {
    const [ searchText, setSearchText ] = useState<string>('');
    const [ searchedColumn, setSearchedColumn ] = useState<string>('');
    const tableEl = useRef<HTMLDivElement>(null);
    const getTableHeight = useTableAdaptHeight(tableEl, OMIT_TABLE_HEIGHT);
    const searchInputRef = useRef<Input>(null);

    function handleSearch(selectedKeys: string, confirm: () => void, dataIndex: string) {
        confirm();
        setSearchText(selectedKeys[0]);
        setSearchedColumn(dataIndex);
    }
    function handleReset(clearFilters: () => void) {
        clearFilters();
        setSearchText('');
    }
    const getUuid = () => uuidv4().split('-')[0]; // ⇨ '9b1deb4d'
    // 编辑时候的角色ID校验显示通过
    useEffect(
        () => {
            if (isEdit) {
                data.forEach((item: any) => {
                    item.isPass = true;
                });
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );

    // eslint-disable-next-line react-hooks/exhaustive-deps
    function getColumnSearchProps(dataIndex: string) {
        return {
            filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: any) => (
                <div style={{ padding: 8 }}>
                    <Input
                        ref={searchInputRef}
                        placeholder={`搜索 ${dataIndex}`}
                        value={selectedKeys[0]}
                        onChange={e => setSelectedKeys(e.target.value ? [ e.target.value ] : [])}
                        onPressEnter={() => handleSearch(selectedKeys, confirm, dataIndex)}
                        style={{ width: 188, marginBottom: 8, display: 'block' }}
                    />
                    <Space>
                        <Button
                            type="primary"
                            onClick={() => handleSearch(selectedKeys, confirm, dataIndex)}
                            icon={<SearchOutlined />}
                            size="small"
                            style={{ width: 90 }}
                        >
                            确定
                        </Button>
                        <Button onClick={() => handleReset(clearFilters)} size="small" style={{ width: 90 }}>
                            清空
                        </Button>
                    </Space>
                </div>
            ),
            filterIcon: (filtered: any) => <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />,
            onFilter: (value: string, record: { [x: string]: { toString: () => string } }) =>
                record[dataIndex] ? record[dataIndex].toString().toLowerCase().includes(value.toLowerCase()) : '',
            onFilterDropdownVisibleChange: (visible: any) => {
                if (visible) {
                    setTimeout(() => searchInputRef?.current?.select(), 100);
                }
            },
            render: (text: { toString: () => string }) =>
                searchedColumn === dataIndex ? (
                    <Highlighter
                        highlightStyle={{ backgroundColor: '#ffc069', padding: 0 }}
                        searchWords={[ searchText ]}
                        autoEscape
                        textToHighlight={text ? text.toString() : ''}
                    />
                ) : (
                    text
                ),
        };
    }
    const tableProps: any = useMemo(() => {
        return {
            columns: [
                {
                    title: '序号',
                    dataIndex: 'id',
                    key: 'id',
                    width: 120,
                    sorter: (a: any, b: any) => a.id - b.id,
                    ...getColumnSearchProps('id'),
                },
                {
                    title: '冰川通行证ID',
                    dataIndex: 'userId',
                    key: 'userId',
                    width: 170,
                    ...getColumnSearchProps('userId'),
                    render: (v: any, row: CheckSenderList) => {
                        return row.isPass || row.userId ? (
                            v
                        ) : (
                            <CloseOutlined style={{ color: '#ff4d4f', padding: 3 }} />
                        );
                    },
                },
                {
                    title: '冰川通行证名称',
                    dataIndex: 'userName',
                    key: 'userName',
                    width: 170,
                    ...getColumnSearchProps('userName'),
                    render: (v: any, row: CheckSenderList) => {
                        return row.isPass || row.userName ? (
                            v
                        ) : (
                            <CloseOutlined style={{ color: '#ff4d4f', padding: 3 }} />
                        );
                    },
                },
                {
                    title: '昵称',
                    dataIndex: 'nickName',
                    key: 'nickName',
                    width: 170,
                    ...getColumnSearchProps('nickName'),
                    render: (v: any, row: CheckSenderList) => {
                        return row?.isPass || row.nickName ? (
                            v
                        ) : (
                            <CloseOutlined style={{ color: '#ff4d4f', padding: 3 }} />
                        );
                    },
                },
                {
                    title: '检测结果',
                    dataIndex: 'isPass',
                    key: 'isPass',
                    sorter: (a: any, b: any) => a.isPass - b.isPass,
                    render: (v: any, row: ICheckRoleTableData) => {
                        let color = v ? '#52c41a' : '#ff4d4f';
                        return (
                            <>
                                {v ? (
                                    <div>
                                        <CheckCircleOutlined style={{ color: color, padding: 3 }} />
                                        {row?.msg || <span>成功</span>}
                                    </div>
                                ) : (
                                    <div>
                                        <CloseOutlined style={{ color: color, padding: 3 }} />
                                        {row?.msg || <span>校验用户失败，请核验</span>}
                                    </div>
                                )}
                            </>
                        );
                    },
                },
            ],
            rowKey: () => getUuid(),
            dataSource: data.filter(Boolean),
            pagination: false,
            size: 'middle',
            bordered: true,
            sticky: true,
            yScroll: true,
            scroll: { y: getTableHeight },
            footer: (data: any[]) => {
                const failedSum = data?.filter((item: CheckSenderList) => !item?.isPass).length;
                return (
                    <div>
                        <span>检测结果失败总数 : </span>
                        <span style={{ paddingLeft: '5px', color: 'red', fontSize: '16px' }}>
                            {failedSum ? failedSum : 0}
                        </span>
                    </div>
                );
            },
        };
    }, [ data, getColumnSearchProps, getTableHeight ]);

    return (
        <Spin spinning={checkedResultLoading}>
            <div ref={tableEl}>
                <Table styles={{ width: '80%' }} {...tableProps} />
            </div>
        </Spin>
    );
}
