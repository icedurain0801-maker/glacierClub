import { Drawer, Spin } from 'antd';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { inject, observer } from 'mobx-react';

import { useContentDialogContainer } from '@/context';
import { getClubToken } from '@/api/club';
import { StoreType } from '@/store/config';

import { CLUB_DEPLOY_VERSION, PostListItem } from '@ts/club';

export type Edit_type = 'create' | 'edit' | 'detail';
interface DetailProps {
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    type?: Edit_type;
    data?: Pick<PostListItem, 'boardId' | 'type' | 'id'>;
    onClose?: () => void;
    visible?: boolean;
    visibleDrawer?: boolean;
    updateIframeSrc?: (src: string) => void;
}

interface DetailPropsMobx extends DetailProps, Pick<StoreType, 'User'> {}
function Detail(props: DetailProps) {
    const {
        clubDeployVersion,
        data,
        onClose,
        visible = true,
        type,
        User: { id: userId },
        visibleDrawer = true,
        updateIframeSrc,
    } = props as DetailPropsMobx;

    const [ clubToken, setclubToken ] = useState('');
    const [ loading, setloading ] = useState(false);
    const fetchClubToken = useCallback(async () => {
        try {
            setloading(true);
            if (data?.boardId && visible) {
                let { data: clubToken } = await getClubToken(
                    { boardId: (data?.boardId || '') as string },
                    clubDeployVersion
                );
                setclubToken(clubToken || '');
            }
        } finally {
            setTimeout(() => {
                setloading(false);
            }, 10);
        }
    }, [ clubDeployVersion, data, visible ]);

    useEffect(() => {
        fetchClubToken();
    }, [ fetchClubToken, data ]);

    const iframeSrc = useMemo(() => {
        try {
            let _domain = JSON.parse(window.processEnv.CLUB_2C_HOST);
            let src = visible
                ? `${_domain[clubDeployVersion].replace(/\/$/, '')}/pages/post/${
                      type === 'edit' ? 'create' : type // 编辑页 暂时与新建页共用
                  }/index?${
                      type === 'create'
                          ? `boardId=${data?.boardId}`
                          : `${type === 'edit' ? 'postId' : 'id'}=${data?.id}`
                  }&env=platform&postType=${data?.type}&clubToken=Bearer ${clubToken}&appKey=session-${userId}`
                : '';
            return src;
        } catch (e) {
            console.error('iframeSrc异常：', e);
        }
    }, [ clubDeployVersion, clubToken, data, type, userId, visible ]);

    useEffect(() => {
        updateIframeSrc && iframeSrc && updateIframeSrc(iframeSrc);
    }, [ iframeSrc, updateIframeSrc ]);

    useEffect(() => {
        if (!visible) {
            setclubToken('');
        }
    }, [ visible ]);

    let SpinRender = (
        <Spin spinning={loading}>
            {clubToken ? (
                <iframe
                    key={clubToken}
                    title="clubiframe"
                    frameBorder="0"
                    style={{ width: '100%', height: 'calc(100vh - 110px)' }}
                    allowFullScreen={true}
                    src={iframeSrc}
                />
            ) : (
                ''
            )}
        </Spin>
    );

    return visibleDrawer ? (
        <Drawer
            // eslint-disable-next-line react-hooks/rules-of-hooks
            getContainer={useContentDialogContainer()}
            closable
            width={780}
            title={`${type === 'create' ? '新增' : '编辑'}帖子`}
            onClose={onClose}
            visible={visible}
        >
            {SpinRender}
        </Drawer>
    ) : (
        SpinRender
    );
}

export default inject('User')(observer(Detail));
