import { Spin } from 'antd';
import { useObserver } from 'mobx-react';
import React from 'react';

import { useStore } from '@/context';

interface IProps {
    children: React.ReactNode;
}

function ClubLoaded(props: IProps) {
    const { children } = props;
    const { Club } = useStore();
    const isLoaded = useObserver(() => Club.isLoaded);
    return isLoaded ? (
        <React.Fragment>{children}</React.Fragment>
    ) : (
        <Spin size="large">
            <div style={{ height: '100vh' }}></div>
        </Spin>
    );
}

export default ClubLoaded;
