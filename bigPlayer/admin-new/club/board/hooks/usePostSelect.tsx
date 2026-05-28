import { debounce, keyBy } from 'lodash';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Select } from 'antd';
import type { SelectProps } from 'antd/es/select';

import { getBasePostList } from '@/api/club';

import { initCouponItem } from '@ts/exchange';
import { CLUB_ENVIRONMENT_ENUM, MOMENT_TYPE } from '@ts/club';
import { Option } from '@ts/app';
export interface IProps {
    init?: boolean;
    clubDeployVersion: CLUB_ENVIRONMENT_ENUM;
    boardId: string | number;
    pageSize?: number;
    isTitleKey?: boolean;
    selectProps?: SelectProps<number | number[]>;
    postType?: string;
}

const PAGE_SIZE = 50;

export const extractId = (value: string | number): number => {
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) {
        return Number(value);
    }

    const match = value.match(/\((\d+)\)/); // 匹配括号中的数字
    return match ? parseInt(match[1]) : 0;
};

export default function usePostSelect(props: IProps) {
    const {
        init = false,
        clubDeployVersion,
        boardId,
        pageSize = PAGE_SIZE,
        selectProps,
        isTitleKey = false,
        postType = [ MOMENT_TYPE.Post, MOMENT_TYPE.Feeling ].join(','),
    } = props;

    const [ postSelections, setPostSelections ] = useState<Option[]>([]);
    const [ initPostSelections, setInitPostSelections ] = useState<Option[]>([]);

    const [ historyPostOptions, setHistoryPostOptions ] = useState<Option[]>([]);
    const [ selectedPostIds, setSelectedPostIds ] = useState<number[]>([]);

    const historyPostOptionsDict = useMemo(() => {
        return keyBy(historyPostOptions, 'value');
    }, [ historyPostOptions ]);

    const allLoadedRef = useRef(true);
    const lastIdRef = useRef(0);

    const getPostList = useCallback(() => {
        if (!initCouponItem) {
            return;
        }
        const query = {
            lastId: 0,
            boardId,
            pageSize: pageSize,
            postType,
        };
        getBasePostList(query, clubDeployVersion).then(({ data }) => {
            if (data?.length) {
                const newArr = data.map(k => {
                    const label = k.title ? `${k.title}(${k.id})` : String(k.id);
                    const value = isTitleKey && k.title ? `${k.title}(${k.id})` : k.id;

                    return { value, label, title: k.title };
                });

                setPostSelections(newArr);
                setInitPostSelections(newArr);
                setHistoryPostOptions(newArr);

                lastIdRef.current = extractId(data?.[data.length - 1]?.id || 0);
            } else {
                setPostSelections([]);
            }
        });
    }, [ boardId, clubDeployVersion, isTitleKey, pageSize, postType ]);

    useEffect(() => {
        if (init) {
            getPostList();
        }
    }, [ getPostList, init ]);

    const debounceFetcher = useMemo(() => {
        const loadOptions = async (searchValue: string) => {
            if (searchValue !== '' && Number.isNaN(Number(searchValue))) {
                setPostSelections([]);
                return;
            }
            const { data } = await getBasePostList(
                {
                    postType,
                    boardId,
                    lastId: lastIdRef.current,
                    pageSize: pageSize,
                    ...(searchValue ? { id: Number(searchValue), lastId: 0 } : {}),
                },
                clubDeployVersion
            );
            lastIdRef.current = extractId(data?.[data.length - 1]?.id || 0);

            if (data?.length) {
                const newArr = data.map(k => {
                    const label = k.title ? `${k.title}(${k.id})` : String(k.id);
                    const value = isTitleKey && k.title ? `${k.title}(${k.id})` : k.id;

                    return { value, label, title: k.title };
                });
                if (searchValue !== '') {
                    setPostSelections(newArr);
                } else {
                    setPostSelections([ ...postSelections, ...newArr ]);
                }
                // 去重
                const uniqueOptions = Array.from(
                    new Map(historyPostOptions.concat(newArr).map(item => [ item.value, item ])).values()
                );
                setHistoryPostOptions(uniqueOptions);
            } else {
                setPostSelections([]);
            }
            if (searchValue === '' && data && data?.length < PAGE_SIZE) {
                allLoadedRef.current = true;
            }
        };
        return debounce(loadOptions, 500);
    }, [ postType, boardId, pageSize, clubDeployVersion, historyPostOptions, isTitleKey, postSelections ]);

    const selectNode = (
        <Select
            style={{ width: 280 }}
            showSearch
            filterOption={false}
            onSearch={value => {
                debounceFetcher(value);
            }}
            onSelect={(value, option) => {
                if (postSelections?.length <= 1) {
                    setPostSelections(initPostSelections);
                }
            }}
            allowClear
            onChange={value => {
                setSelectedPostIds(value as number[]);
            }}
            onFocus={() => {
                setPostSelections(initPostSelections);
                const lastPost = initPostSelections[PAGE_SIZE - 1];
                lastIdRef.current = extractId(lastPost?.value as number) || 0;
            }}
            onPopupScroll={({ target }: { target: any }) => {
                const { clientHeight, scrollTop, scrollHeight } = target;
                if (parseInt(scrollTop) + clientHeight >= scrollHeight - 20) {
                    if (allLoadedRef.current) {
                        debounceFetcher('');
                    }
                }
            }}
            mode="multiple"
            maxTagCount={2}
            {...selectProps}
            options={postSelections}
        ></Select>
    );

    return {
        selectedPostIds,
        selectNode,
        historyPostOptionsDict,
        setSelectedPostIds,
    };
}
