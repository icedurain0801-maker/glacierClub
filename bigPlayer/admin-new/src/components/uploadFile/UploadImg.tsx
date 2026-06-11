import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Button, message, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';

interface UploadImgProps {
  value?: string;
  onChange?: (url: string) => void;
  maxSize?: number;
  maxCount?: number;
  accept?: string;
  disabled?: boolean;
  imageOrigin?: string;
  uploadButton?: ReactNode;
  uploadOption?: unknown;
  sizeType?: 'small' | string;
  isRandomFileName?: boolean;
}

export default function UploadImg({
  value,
  onChange,
  maxSize,
  maxCount,
  accept,
  disabled,
  imageOrigin,
  uploadButton,
  sizeType,
}: UploadImgProps) {
  const [url, setUrl] = useState<string | undefined>(value);
  const isSmall = sizeType === 'small';
  const previewUrl =
    url && imageOrigin && !/^(data:|https?:\/\/|\/)/.test(url) ? `${imageOrigin}${url}` : url;

  useEffect(() => {
    setUrl(value);
  }, [value]);

  const beforeUpload = (file: File) => {
    if (maxSize && file.size > maxSize) {
      message.error('File is too large');
      return false;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setUrl(dataUrl);
      onChange?.(dataUrl);
      message.success('Upload success');
    };
    reader.readAsDataURL(file);
    return false;
  };

  const boxStyle: CSSProperties = isSmall
    ? {
        width: '100%',
        height: '100%',
        minWidth: 32,
        minHeight: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px dashed #d9d9d9',
        borderRadius: 2,
        color: '#8c8c8c',
        cursor: disabled ? 'not-allowed' : 'pointer',
        overflow: 'hidden',
        background: '#fff',
      }
    : {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
      };

  const preview = previewUrl ? (
    <img src={previewUrl} alt="" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
  ) : (
    uploadButton || <UploadOutlined />
  );

  return (
    <Upload beforeUpload={beforeUpload} showUploadList={false} accept={accept} disabled={disabled} maxCount={maxCount}>
      {isSmall ? (
        <div className="UploadImg-small" style={boxStyle}>
          {preview}
        </div>
      ) : url ? (
        <div className="UploadImg" style={{ ...boxStyle, maxHeight: 80, maxWidth: 120 }}>
          {preview}
        </div>
      ) : (
        <Button icon={<UploadOutlined />} disabled={disabled}>
          Upload
        </Button>
      )}
    </Upload>
  );
}
