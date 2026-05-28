import { Descriptions, Drawer } from 'antd';
import React, { useCallback, useState } from 'react';

import { useContentDialogContainer } from '@/context';
import { simpleTime } from '@/utils/date';
import { queryStringToObject } from '@/utils/helper';
import { getBoardList } from '@/api/club';

import { AuditStatusColor, AuditStatusConstant, CLUB_DEPLOY_VERSION, PostListItem } from '@ts/club';

import PostEdit from './PostEdit';
require('./PostDetail.less');
interface DetailProps {
    type?: 'recycleBin' | 'detail';
    data?: PostListItem;
    onClose: () => void;
    visible: boolean;
    clubDeployVersion: CLUB_DEPLOY_VERSION;
}
export default function Detail(props: DetailProps) {
    const { data, onClose, visible, type, clubDeployVersion } = props;
    const [ iframeSrc, updateIframeSrc ] = useState('-');
    const onUpdateIframeSrc = useCallback(
        async (src: string) => {
            try {
                const queryStringObj = queryStringToObject(src);
                const { data: boards } = await getBoardList(
                    { id: data!.boardId, pageIndex: 1, pageSize: 100 },
                    clubDeployVersion
                );
                const games = boards?.find(v => v.id === data!.boardId)?.games ?? [];
                updateIframeSrc(
                    `${src.split('?')[0]}?id=${queryStringObj.id}&env=web` +
                        (games.length ? `&gameId=${games[0].gameId}&gameVersion=${games[0].gameVersion}` : '')
                );
            } catch (err) {
                console.log('err', err);
            }
        },
        [ clubDeployVersion, data ]
    );

    return (
        <Drawer
            getContainer={useContentDialogContainer()}
            closable
            width={800}
            title="帖子详情"
            onClose={onClose}
            visible={visible}
            className="post-detail detail-drawer-wrap"
        >
            <Descriptions title="帖子信息" bordered labelStyle={{ maxWidth: '120px' }}>
                <Descriptions.Item label="发布人通行证" span={3}>
                    {data?.userName}
                </Descriptions.Item>
                <Descriptions.Item label="创建时间" span={3}>
                    {simpleTime(data?.createTime)}
                </Descriptions.Item>
                <Descriptions.Item label="标题" span={3}>
                    {data?.title || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="话题" span={3}>
                    <span style={{ color: '#3333ffa5' }}>{data?.topics?.map(v => '#' + v).join('') ?? '-'}</span>
                </Descriptions.Item>
                <Descriptions.Item label="链接" span={3}>
                    <a target="_blank" href={iframeSrc}>
                        {iframeSrc}
                    </a>
                </Descriptions.Item>
                <Descriptions.Item label="内容" span={3}>
                    <div className="content-wrap">
                        <PostEdit
                            type="detail"
                            data={data}
                            visibleDrawer={false}
                            clubDeployVersion={clubDeployVersion}
                            updateIframeSrc={src => onUpdateIframeSrc(src)}
                        />
                    </div>
                    {/* <div className="content-wrap">
                        {content?.map((item, index) => {
                            let itemRender =
                                item.Type === RICH_TEXT_TYPE_ENUM.Text ? (
                                    <div className="txt">{item?.Data}</div>
                                ) : item.Type === RICH_TEXT_TYPE_ENUM.Image ? (
                                    <div className="img">
                                        <Image
                                            src={data?.prefix?.replace(/\/$/, '') + '/' + item?.Data.replace(/^\//, '')}
                                        />
                                    </div>
                                ) : (
                                    <div className="video">
                                        <video
                                            src={data?.prefix + item?.Data}
                                            controls={true}
                                            className="video__ele"
                                        ></video>
                                    </div>
                                );
                            return (
                                <div key={index} className="content-item">
                                    {itemRender}
                                </div>
                            );
                        })}
                    </div> */}
                </Descriptions.Item>
            </Descriptions>
            <br />
            {type === 'recycleBin'
                ? data?.deleteTime &&
                  data?.deleteBy && (
                      <Descriptions title="删除信息" bordered labelStyle={{ maxWidth: '120px' }}>
                          <Descriptions.Item label="删除人" span={3}>
                              {data?.deleteBy}
                          </Descriptions.Item>

                          <Descriptions.Item label="删除时间" span={3}>
                              {simpleTime(data?.deleteTime)}
                          </Descriptions.Item>
                      </Descriptions>
                  )
                : data?.auditTime &&
                  data?.auditedBy && (
                      <Descriptions title="审核信息" bordered labelStyle={{ maxWidth: '120px' }}>
                          <Descriptions.Item label="审核人员" span={2}>
                              {data?.auditedBy}
                          </Descriptions.Item>
                          <Descriptions.Item label="审核结果" span={2}>
                              <span style={{ color: AuditStatusColor[data?.status as keyof typeof AuditStatusColor] }}>
                                  {AuditStatusConstant[data?.status as keyof typeof AuditStatusConstant]}
                              </span>
                          </Descriptions.Item>
                          <Descriptions.Item label="审核时间" span={2}>
                              {simpleTime(data?.auditTime)}
                          </Descriptions.Item>
                          <Descriptions.Item label="审核备注" span={2}>
                              {data?.remark}
                          </Descriptions.Item>
                      </Descriptions>
                  )}
            <Descriptions title="标签信息" bordered labelStyle={{ maxWidth: '120px' }}>
                <Descriptions.Item label="标签" span={2}>
                    {data?.tags ? <span style={{ color: '#3399cc' }}>{JSON.parse(data.tags).join('、')}</span> : '-'}
                </Descriptions.Item>
            </Descriptions>
        </Drawer>
    );
}
