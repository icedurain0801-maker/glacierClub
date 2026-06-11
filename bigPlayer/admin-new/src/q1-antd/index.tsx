import { ReactNode, useImperativeHandle, useMemo, forwardRef } from 'react';
import { Form, Button, Space, Card } from 'antd';
import type { FormInstance, FormItemProps } from 'antd';
import type { TableProps, ColumnsType as AntColumnsType } from 'antd/es/table';
import { Table } from 'antd';

// ============ FilterBox ============

export interface FilterBoxContext {
  form: FormInstance;
  validate: () => Promise<any>;
  reset: () => void;
}

interface FilterBoxProps {
  context: FilterBoxContext;
  query: () => void;
  tableName?: string;
  showAdvancedFilter?: boolean;
  initialValues?: Record<string, any>;
  children?: ReactNode;
}

function FilterBoxComp({ context, query, initialValues, children }: FilterBoxProps) {
  return (
    <Card style={{ marginBottom: 12 }} bodyStyle={{ paddingBottom: 0 }}>
      <Form
        form={context.form}
        layout="inline"
        initialValues={initialValues}
        onValuesChange={() => {
          // values change is handled by individual fields
        }}
      >
        <Space size={[16, 12]} wrap>
          {children}
          <Form.Item>
            <Button type="primary" onClick={query}>
              查询
            </Button>
          </Form.Item>
          <Form.Item>
            <Button onClick={context.reset}>重置</Button>
          </Form.Item>
        </Space>
      </Form>
    </Card>
  );
}

interface FilterItemProps extends Omit<FormItemProps, 'children'> {
  children?: ReactNode;
  type?: string;
}
function FilterItem({ children, className, style, noStyle, type, ...rest }: FilterItemProps) {
  const itemClassName = [className, type === 'compactNormal' ? 'filterbox-compact-normal' : ''].filter(Boolean).join(' ');

  return (
    <Form.Item
      {...rest}
      className={itemClassName || undefined}
      noStyle={noStyle}
      style={noStyle ? style : { minWidth: 200, ...style }}
    >
      {children as any}
    </Form.Item>
  );
}

export const FilterBox = Object.assign(FilterBoxComp, {
  Item: FilterItem,
  useFilterBox(): FilterBoxContext {
    const [form] = Form.useForm();
    return useMemo(
      () => ({
        form,
        validate: async () => {
          return form.getFieldsValue();
        },
        reset: () => form.resetFields(),
      }),
      [form]
    );
  },
});

// ============ Q1Table ============

export type ColumnsType<T> = AntColumnsType<T>;

export interface Q1TablePropsType<T> extends Omit<TableProps<T>, 'title'> {
  tableName?: string;
  tableTools?: ReactNode;
  scrollToFirstRowOnChange?: boolean;
}

export function Q1Table<T extends object = any>(props: Q1TablePropsType<T>) {
  const { tableTools, tableName: _t, scrollToFirstRowOnChange: _s, scroll, ...rest } = props;
  const mergedScroll = { x: 'max-content' as const, ...scroll };

  return (
    <div>
      {tableTools && <div style={{ marginBottom: 12 }}>{tableTools}</div>}
      <Table<T> size="middle" bordered scroll={mergedScroll} {...rest} />
    </div>
  );
}
