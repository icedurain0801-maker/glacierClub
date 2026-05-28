import { Form } from 'antd';
import React, { useMemo } from 'react';

import NumberSwitch from '@/components/NumberSwitch';
import UploadImg from '@/components/uploadFile/UploadImg';

import { BANNER_IMAGEURL_VISIBLE, BoardEditParams } from '@ts/club';

import { useClubUploadOption } from '../../../hooks/useClubUploadOption';
require('./index.less');
interface ImageFormProps {
    data: BoardEditParams;
}
export default function ImageForm(props: ImageFormProps) {
    const { data } = props;
    const ClubUploadOption = useClubUploadOption({ clubDeployVersion: data.clubDeployVersion || '' });
    return useMemo(
        () => (
            <div className="image-form-table">
                <Form.Item name="imageUrlVisible" label="板块banner" required>
                    <NumberSwitch checkedChildren="开启" unCheckedChildren="关闭" />
                </Form.Item>
                <Form.Item noStyle shouldUpdate={(prev, next) => prev.imageUrlVisible !== next.imageUrlVisible}>
                    {({ getFieldValue }) => {
                        const imageUrlVisible = getFieldValue('imageUrlVisible');
                        return imageUrlVisible === BANNER_IMAGEURL_VISIBLE.Open ? (
                            <Form.Item
                                name="imageUrl"
                                label="版块图片"
                                extra="建议：尺寸750*160，png/jpg格式，内存1M以内"
                            >
                                <UploadImg
                                    imageOrigin=""
                                    uploadOption={ClubUploadOption}
                                    maxSize={1 * 1024 * 1024}
                                    accept="image/png,image/jpeg"
                                    isRandomFileName={true}
                                />
                            </Form.Item>
                        ) : null;
                    }}
                </Form.Item>
                <Form.Item name="holidaySkinEnabled" label="节假日皮肤" required>
                    <NumberSwitch checkedChildren="开启" unCheckedChildren="关闭" />
                </Form.Item>
                <Form.Item noStyle shouldUpdate={(prev, next) => prev.holidaySkinEnabled !== next.holidaySkinEnabled}>
                    {({ getFieldValue }) => {
                        return (
                            <div
                                style={{
                                    display: getFieldValue('holidaySkinEnabled') ? 'block' : 'none',
                                }}
                            >
                                <Form.Item
                                    name="startupPageUrl"
                                    label="启动页"
                                    extra="建议 750*1334,png、jpg格式，不超过10M"
                                    {...(getFieldValue('holidaySkinEnabled')
                                        ? { rules: [ { required: true, message: '启动页不能留空' } ] }
                                        : {})}
                                >
                                    <UploadImg
                                        imageOrigin=""
                                        uploadOption={ClubUploadOption}
                                        maxSize={10 * 1024 * 1024}
                                        accept="image/png,image/jpg,image/jpeg"
                                        isRandomFileName={true}
                                    />
                                </Form.Item>
                                <Form.Item label="功能栏图标" className="toolbar-icon" extra="建议 80*30,png、jpg格式">
                                    <div className="flex">
                                        <div className="flex column">
                                            <div className="title">首页</div>
                                            <Form.Item name="homeUrl" noStyle>
                                                <UploadImg
                                                    imageOrigin=""
                                                    uploadOption={ClubUploadOption}
                                                    maxSize={5 * 1024 * 1024}
                                                    accept="image/png,image/jpg,image/jpeg"
                                                    isRandomFileName={true}
                                                />
                                            </Form.Item>
                                        </div>
                                        <div className="flex column">
                                            <div className="title">资讯</div>
                                            <Form.Item name="newseUrl" noStyle>
                                                <UploadImg
                                                    imageOrigin=""
                                                    uploadOption={ClubUploadOption}
                                                    maxSize={5 * 1024 * 1024}
                                                    accept="image/png,image/jpg,image/jpeg"
                                                    isRandomFileName={true}
                                                />
                                            </Form.Item>
                                        </div>
                                        <div className="flex column">
                                            <div className="title">玩家圈</div>
                                            <Form.Item name="playerCircleUrl" noStyle>
                                                <UploadImg
                                                    imageOrigin=""
                                                    uploadOption={ClubUploadOption}
                                                    maxSize={5 * 1024 * 1024}
                                                    accept="image/png,image/jpg,image/jpeg"
                                                    isRandomFileName={true}
                                                />
                                            </Form.Item>
                                        </div>
                                        <div className="flex column">
                                            <div className="title">我的</div>
                                            <Form.Item name="myImageUrl" noStyle>
                                                <UploadImg
                                                    imageOrigin=""
                                                    uploadOption={ClubUploadOption}
                                                    maxSize={5 * 1024 * 1024}
                                                    accept="image/png,image/jpg,image/jpeg"
                                                    isRandomFileName={true}
                                                />
                                            </Form.Item>
                                        </div>
                                        <div className="flex column">
                                            <div className="title">发帖</div>
                                            <Form.Item name="postUrl" noStyle>
                                                <UploadImg
                                                    imageOrigin=""
                                                    uploadOption={ClubUploadOption}
                                                    maxSize={5 * 1024 * 1024}
                                                    accept="image/png,image/jpg,image/jpeg"
                                                    isRandomFileName={true}
                                                />
                                            </Form.Item>
                                        </div>
                                    </div>
                                    <div className="font-tip">建议 120*120,png、jpg格式，不超过5M</div>
                                    <div className="flex column flex-start">
                                        <div className="flex column">
                                            <div className="title">福利任务</div>
                                            <Form.Item name="rewardTaskUrl" noStyle>
                                                <UploadImg
                                                    imageOrigin=""
                                                    uploadOption={ClubUploadOption}
                                                    maxSize={5 * 1024 * 1024}
                                                    accept="image/png,image/jpg,image/jpeg"
                                                    isRandomFileName={true}
                                                />
                                            </Form.Item>
                                        </div>
                                    </div>
                                </Form.Item>
                            </div>
                        );
                    }}
                </Form.Item>
            </div>
        ),
        [ ClubUploadOption ]
    );
}
