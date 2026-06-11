import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { Button, Form, Modal, Table, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { get, keyBy } from 'lodash';

import ReadFile from '@/components/uploadFile/readXls';
import { submitAccountBatch, validateAccountBatch } from '@/api/club';

import { CLUB_DEPLOY_VERSION, ChangerUsersType } from '@ts/club';

// xlsx/xlsx-style loaded dynamically to avoid Vite build issues
let XLSX: any = null;
let XLSXStyle: any = null;
let saveAs: any = null;
const loadXlsx = async () => {
  if (!XLSX) {
    [{ default: saveAs }, XLSX, XLSXStyle] = await Promise.all([
      import('file-saver'),
      import('xlsx'),
      import('xlsx-style'),
    ]);
  }
};
import './index.less';

interface UserForbidProps {
    visible: boolean;
    onClose(): void;
    boardId: number;
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    onSubmit(): void;
}
function UserForbid(props: UserForbidProps) {
    const { visible, onClose, boardId, clubDeployVersion, onSubmit } = props;
    const [ form ] = Form.useForm();
    const [ validateAccount, setValidateAccount ] = useState<Array<any>>([]);
    const [ loading, setLoading ] = useState(false);
    const [ validateInfo, setValidateInfo ] = useState<{
        total: number;
        success: number;
        fail: number;
        failIndex: Array<number>;
    }>({
        total: 0,
        success: 0,
        fail: 0,
        failIndex: [],
    });

    async function handleBatchForbidSubmit() {
        setLoading(true);
        try {
            const changerUsers = validateAccount
                .filter(v => v.isPass)
                .map(v => ({
                    userStatsId: v.userStatsId,
                    status: 1,
                    userInfoId: v.userInfoId,
                    dateType: v.dateType,
                    dateValue: v.dateType === 6 ? 0 : 1,
                    remark: v.remark,
                })) as ChangerUsersType[];
            const { msg, code } = await submitAccountBatch({ boardId }, { changerUsers }, clubDeployVersion);
            if (code === 0) {
                message.success('操作成功');
                onSubmit();
                resetFields();
            } else {
                message.error(msg);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }
    // 重置表单
    const resetFields = useCallback(() => {
        form.resetFields();
        setValidateAccount([]);
    }, [ form ]);
    const errorColumns = useMemo(() => {
        return [
            {
                title: '序号',
                width: 80,
                dataIndex: 'index',
            },
            {
                title: '冰川/渠道账号ID',
                width: 120,
                dataIndex: 'id',
            },
            {
                title: '冰川通行证名称',
                width: 120,
                dataIndex: 'userName',
            },
            {
                title: '封禁天数',
                width: 100,
                dataIndex: 'days',
            },
            {
                title: '封禁理由',
                width: 120,
                dataIndex: 'remark',
            },
            {
                title: '失败原因',
                dataIndex: 'failReason',
                render: (v: string) => <span style={{ color: 'red' }}>{v}</span>,
            },
        ];
    }, []);
    const handleUpload = useCallback(
        async (excelData, file) => {
            const excelDataFormatter = excelData.slice(1);
            if (!excelDataFormatter.length || excelDataFormatter.length > 10000) {
                if (file) {
                    return message.error(excelDataFormatter.length ? '请不要上传超过10000条数据' : '请不要上传空表噢~');
                }
                resetFields();
                return;
            }
            resetFields();
            try {
                const userIds: string[] = [];
                let validateAccount = excelDataFormatter.map((item: any, idx: number) => ({
                    id: item[0] || '',
                    days: item[1] ?? '',
                    dateType:
                        item[1] != null
                            ? item[1] === 0
                                ? 6
                                : item[1] === 1
                                ? 2
                                : item[1] === 2
                                ? 3
                                : item[1] === 3
                                ? 4
                                : ''
                            : '',
                    dateValue: 1,
                    remark: item[2] || '',
                    index: idx + 1,
                }));
                validateAccount.forEach((item: any, index: number) => {
                    if (item.id) {
                        userIds.push(item.id);
                    }
                });
                if (!userIds.length) {
                    return message.error('请至少填写一项冰川/渠道账号ID');
                }
                const { data } = await validateAccountBatch({ boardId }, { userIds }, clubDeployVersion);
                const validateAccountMap = keyBy(data, item => item.userId);
                let accountMap = new Map();
                validateAccount = validateAccount.map((item: any, index: number) => {
                    const flag = !!get(validateAccountMap, `${item.id}`);
                    let failReason: Array<string> = [];
                    if (!item.id) {
                        failReason.push('冰川/渠道账号ID未填写');
                    }
                    if (!flag && item.id) {
                        failReason.push('账号不存在');
                    }
                    if (item.days == null) {
                        failReason.push('封禁天数未填写');
                    }
                    if (![ 0, 1, 2, 3 ].includes(item.days)) {
                        failReason.push('封禁天数未按指定要求填写（0-永久 ，1-天，2-7天，3-30天）');
                    }
                    if (!item.remark) {
                        failReason.push('封禁理由未填写');
                    }
                    if (accountMap.has(item.id)) {
                        failReason.push(`冰川/渠道账号ID与序号${accountMap.get(item.id)}重复`);
                    }
                    accountMap.set(item.id, item.index);
                    return {
                        ...item,
                        userInfoId: flag ? get(validateAccountMap, `${item.id}.userInfoId`) : '',
                        userStatsId: flag ? get(validateAccountMap, `${item.id}.userStatsId`) : '',
                        userName: flag ? get(validateAccountMap, `${item.id}.userName`) : '',
                        isPass: failReason.length === 0,
                        failReason: failReason.join('、'),
                    };
                });
                setValidateAccount(validateAccount);
            } catch (error) {}
        },
        [ boardId, clubDeployVersion, resetFields ]
    );
    useEffect(() => {
        const successLen = validateAccount.filter(v => v.isPass).length;
        const failLen = validateAccount.filter(v => !v.isPass).length;
        const failIndex: Array<number> = [];
        if (failLen > 0) {
            validateAccount.forEach((item, idx: number) => {
                if (!item.isPass) {
                    failIndex.push(item.index);
                }
            });
        }
        setValidateInfo({
            total: validateAccount.length,
            success: successLen,
            fail: failLen,
            failIndex,
        });
    }, [ validateAccount ]);
    const handleUploadFailure = useCallback(() => {
        const data = validateAccount
            .filter(v => !v.isPass)
            .map((v: any) => ({
                序号: v.index ?? '',
                '冰川/渠道账号ID': v.id ?? '',
                冰川通行证名称: v.userName ?? '',
                '封禁天数（0-永久 ，1-天，2-7天，3-30天）': v.days ?? '',
                封禁理由: v.remark ?? '',
                失败原因: v.failReason ?? '',
            }));
        const workBook = XLSX.utils.book_new();
        const workSheet = XLSX.utils.json_to_sheet(data);
        workSheet['!cols'] = [
            {
                wch: 8,
            },
            {
                wch: 12,
            },
            {
                wch: 15,
            },
            {
                wch: 42,
            },
            {
                wch: 20,
            },
            {
                wch: 40,
            },
        ];
        XLSX.utils.book_append_sheet(workBook, workSheet);
        const fileName = `错误内容表格.xlsx`;
        const fileData = XLSXStyle.write(workBook, {
            bookType: 'xlsx',
            cellStyles: true,
            type: 'buffer',
        });
        saveAs(new Blob([ fileData ]), fileName);
    }, [ validateAccount ]);
    const renderTips = useMemo(() => {
        let failString: Array<string> = [];
        if (validateInfo.failIndex.length > 0) {
            validateInfo.failIndex.forEach(item => {
                failString.push(`【${item}】`);
            });
        }
        return (
            <p className="info-panel">
                <span>{`总计 ${validateInfo.total} 项记录，成功 `}</span>
                <span className="success">{validateInfo.success}</span>
                <span>{` 项`}</span>
                {validateInfo.fail > 0 ? (
                    <>
                        <span>{`,失败 `}</span>
                        <span className="fail">{validateInfo.fail}</span>
                        <span>{` 项`}</span>
                        <span>{`，失败序号为：${failString.join('，')}`}</span>{' '}
                        <span className="upload-fail" onClick={handleUploadFailure}>
                            导出失败项
                        </span>
                    </>
                ) : (
                    ''
                )}
            </p>
        );
    }, [ handleUploadFailure, validateInfo.fail, validateInfo.failIndex, validateInfo.success, validateInfo.total ]);
    function onCancel() {
        resetFields();
        onClose();
    }
    return (
        <Modal
            visible={visible}
            onCancel={onCancel}
            width={900}
            destroyOnClose
            className="user-batch-forbid-modal"
            footer={
                <div className="flex end">
                    <Button onClick={onCancel} style={{ marginRight: 16 }}>
                        取消
                    </Button>
                    <Button
                        loading={loading}
                        type="primary"
                        onClick={handleBatchForbidSubmit}
                        disabled={Boolean(!validateInfo.total || !validateInfo.success)}
                    >
                        确认封禁
                    </Button>
                </div>
            }
            title="账号批量封禁"
        >
            <Form>
                <Form.Item label="批量表格上传" required>
                    <div className="flex">
                        <ReadFile
                            accept=",application/vnd.ms-excel,.xlsx"
                            uploadNode={<Button icon={<UploadOutlined />}>上传文件</Button>}
                            onChange={handleUpload}
                            readAsTextEncode="ansi"
                            parsingOptions={{ cellDates: true }}
                        />
                        <Button type="link" href="#" download="账号批量封禁模板表格.xlsx">
                            下载模板表格
                        </Button>
                    </div>
                </Form.Item>

                {validateInfo.total > 0 && (
                    <>
                        {renderTips}
                        <Table
                            rowKey="index"
                            dataSource={validateAccount}
                            columns={errorColumns}
                            bordered
                            scroll={{ y: 300 }}
                        />
                    </>
                )}
                <div className="font-red">确认封禁会将校验成功的通行证封禁处理</div>
            </Form>
        </Modal>
    );
}

export default memo(UserForbid);
