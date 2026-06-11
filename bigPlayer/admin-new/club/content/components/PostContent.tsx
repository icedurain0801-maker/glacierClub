import React, { useCallback } from 'react';
import { Image, Popover } from 'antd';

import placeholderImage from '@/assets/placeholder_image.png';
import placeholderVideo from '@/assets/placeholder_video.png';

import { PostListItem, RichTextType, RICH_TEXT_TYPE_ENUM } from '@ts/club';

import './PostContent.less';

const parseRichContent = (content?: string): RichTextType[] => {
    if (!content) {
        return [];
    }
    try {
        const parsed = JSON.parse(content);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [ { Type: RICH_TEXT_TYPE_ENUM.Text, Data: String(content) } ];
    }
};

interface PostContentProps extends PostListItem {
    showOriginImage?: Boolean; // 是否显示原始图片，默认显示占位图片
}

export default function PostContent(props: PostContentProps) {
    const { showOriginImage = false, content } = props;

    const imageRender = useCallback(
        (item: RichTextType) => {
            let result;
            try {
                if (content) {
                    if (showOriginImage) {
                        result = (
                            <div>
                                <Image
                                    className="club-post-content-img"
                                    key={item.Data}
                                    src={item.Data}
                                    alt={item.Data}
                                />
                            </div>
                        );
                    } else {
                        result = (
                            <div>
                                <img src={placeholderImage} width={24} alt={item.Data} />
                            </div>
                        );
                    }
                }
            } catch (e) {
                console.error('imageRender:', e);
            }
            return result;
        },
        [ content, showOriginImage ]
    );

    return (
        <div className="club-post-content-contain">
            {parseRichContent(content).map((v: RichTextType, i: number) => {
                const data = String(v?.Data ?? '');
                let node = null;
                switch (v.Type) {
                    case RICH_TEXT_TYPE_ENUM.Text:
                    case RICH_TEXT_TYPE_ENUM.Link:
                        node =
                            data.length >= 99 ? (
                                <Popover
                                    content={
                                        <div style={{ maxWidth: '40vw', maxHeight: '60vh', overflow: 'auto' }}>
                                            {data}
                                        </div>
                                    }
                                >
                                    <span>{data.substring(0, 100) + '...'}</span>
                                </Popover>
                            ) : (
                                <span>{data}</span>
                            );
                        break;
                    case RICH_TEXT_TYPE_ENUM.Image:
                        node = imageRender(v);
                        break;
                    case RICH_TEXT_TYPE_ENUM.Video:
                        node = (
                            <div>
                                <img src={placeholderVideo} width={24} alt="" />
                            </div>
                        );
                        break;
                    case RICH_TEXT_TYPE_ENUM.Emoji:
                        node = <img src={v.Data} width={24} className="emoji" alt="" />;
                        break;
                }
                return <span key={i}>{node}</span>;
            })}
        </div>
    );
}

/** 仅展示文字 */
export function PostContentOnlyText(content: string) {
    let result = '';
    try {
        if (content) {
            result =
                parseRichContent(content)
                    ?.map((item: RichTextType) => (item?.Type === RICH_TEXT_TYPE_ENUM.Text ? item?.Data : ''))
                    .join(' ') || '';
        }
    } catch (e) {
        console.error(e);
    }
    return <span>{result.length >= 99 ? String(result.substring(0, 100)) + '...' : result}</span>;
}
