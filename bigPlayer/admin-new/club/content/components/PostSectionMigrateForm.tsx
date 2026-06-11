import { Form, TreeSelect } from 'antd';
import React from 'react';

import { IdNameOptionsType } from '@ts/club';
import './PostSectionMigrateForm.less';
interface PostSectionMigrateFormProps {
    treeData: IdNameOptionsType[];
    length: number;
    sectionName: string;
}
export default React.forwardRef(function PostSectionMigrateForm(
    { treeData, length, sectionName }: PostSectionMigrateFormProps,
    ref
) {
    const [ form ] = Form.useForm();
    React.useImperativeHandle(ref, () => ({
        form,
    }));
    return (
        <Form className="club-post-section-migrate-form" form={form}>
            <div className="intro">
                共选择 <span className="color-blue">{length}</span> 个帖子,当前栏目为{' '}
                <span className="color-blue">{sectionName}</span>
            </div>
            <Form.Item name="sectionId" label="迁移至" rules={[ { message: '请选择一个栏目', required: true } ]}>
                <TreeSelect
                    placeholder="请选择栏目"
                    allowClear
                    showSearch
                    treeDefaultExpandAll
                    className="club-post-section-treeSelect"
                    treeData={treeData}
                />
            </Form.Item>
        </Form>
    );
});
