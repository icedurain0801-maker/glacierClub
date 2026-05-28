import React, { useMemo } from 'react';
import { Popover } from 'antd';

import { ConversationMessageItem } from '@ts/club';

interface UserMessageProps {
    message: ConversationMessageItem;
}

function UserMessage(props: UserMessageProps) {
    const { message } = props;

    const renderNode = useMemo(() => {
        let node = null;
        const { content } = message;
        node =
            content?.data.length >= 99 ? (
                <Popover
                    content={
                        <div style={{ maxWidth: '40vw', maxHeight: '60vh', overflow: 'auto' }}>{content?.data}</div>
                    }
                >
                    <span>{String(content?.data.substring(0, 100)) + '...'}</span>
                </Popover>
            ) : (
                <span>{content?.data}</span>
            );
        return node;
    }, [ message ]);

    return <div className="msg-item">{renderNode}</div>;
}

export default UserMessage;
