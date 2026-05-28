import { debounce, keyBy } from 'lodash';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Select } from 'antd';
import type { SelectProps } from 'antd/es/select';

import { searchLotteryAuthor } from '@/api/club';

import { Option } from '@ts/app';
import { CLUB_DEPLOY_VERSION, LotteryAuthorSearchItem } from '@ts/club';

const PAGE_SIZE = 10;

type UserOption = Option & {
    nickName?: string;
};

interface IProps {
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    boardId: number;
    pageSize?: number;
    selectProps?: SelectProps<number>;
    initialOptions?: UserOption[];
}

function formatUserOption(item: LotteryAuthorSearchItem): UserOption {
    return {
        value: item.userInfoId,
        label: `${item.nickName}（${item.userInfoId}）`,
        nickName: item.nickName,
    };
}

export default function useUserSelect(props: IProps) {
    const { clubDeployVersion, boardId, pageSize = PAGE_SIZE, selectProps, initialOptions = [] } = props;

    const [ userSelections, setUserSelections ] = useState<UserOption[]>(initialOptions);
    const [ initUserSelections, setInitUserSelections ] = useState<UserOption[]>(initialOptions);
    const [ historyUserOptions, setHistoryUserOptions ] = useState<UserOption[]>(initialOptions);
    const [ loading, setLoading ] = useState(false);

    const historyUserOptionsDict = useMemo(() => {
        return keyBy(historyUserOptions, 'value');
    }, [ historyUserOptions ]);

    // Store the next page to request. The API page index is 0-based.
    const pageIndexRef = useRef(0);
    const fetchRef = useRef(0);
    const hasMoreRef = useRef(false);
    const loadingMoreRef = useRef(false);
    const currentSearchRef = useRef('');

    useEffect(() => {
        setInitUserSelections(initialOptions);
        setHistoryUserOptions(prev =>
            Array.from(new Map(prev.concat(initialOptions).map(item => [ item.value, item ])).values())
        );
        if (!currentSearchRef.current.trim()) {
            setUserSelections(initialOptions);
        }
    }, [ initialOptions ]);

    const loadOptions = useCallback(
        async (searchValue: string, append = false) => {
            const keyword = searchValue.trim();
            if (!keyword) {
                currentSearchRef.current = '';
                pageIndexRef.current = 0;
                hasMoreRef.current = false;
                loadingMoreRef.current = false;
                setUserSelections(initUserSelections);
                setLoading(false);
                return;
            }
            if (append) {
                if (loadingMoreRef.current || !hasMoreRef.current) {
                    return;
                }
                loadingMoreRef.current = true;
            } else {
                currentSearchRef.current = keyword;
                pageIndexRef.current = 0;
                hasMoreRef.current = false;
                setLoading(true);
            }
            const nextPage = pageIndexRef.current;
            const fetchId = ++fetchRef.current;
            try {
                const { code, data = [] } = await searchLotteryAuthor(
                    {
                        boardId,
                        value: keyword,
                        offset: nextPage * pageSize,
                        pageSize,
                    },
                    clubDeployVersion
                );
                if (fetchId !== fetchRef.current || currentSearchRef.current !== keyword) {
                    return;
                }
                if (code === 0) {
                    const newArr = data.map(formatUserOption);
                    pageIndexRef.current = nextPage + 1;
                    hasMoreRef.current = newArr.length >= pageSize;
                    setUserSelections(prev => (append ? prev.concat(newArr) : newArr));
                    setHistoryUserOptions(prev =>
                        Array.from(new Map(prev.concat(newArr).map(item => [ item.value, item ])).values())
                    );
                } else if (!append) {
                    setUserSelections([]);
                    hasMoreRef.current = false;
                }
            } finally {
                if (fetchId === fetchRef.current && currentSearchRef.current === keyword) {
                    if (append) {
                        loadingMoreRef.current = false;
                    } else {
                        setLoading(false);
                    }
                }
            }
        },
        [ boardId, clubDeployVersion, initUserSelections, pageSize ]
    );

    const debounceFetcher = useMemo(() => {
        return debounce((searchValue: string) => {
            loadOptions(searchValue, false);
        }, 500);
    }, [ loadOptions ]);

    useEffect(() => {
        return () => {
            debounceFetcher.cancel();
        };
    }, [ debounceFetcher ]);

    const selectNode = (
        <Select
            showSearch
            filterOption={false}
            onSearch={value => {
                debounceFetcher(value);
            }}
            onFocus={() => {
                if (!currentSearchRef.current.trim()) {
                    setUserSelections(initUserSelections);
                }
            }}
            onPopupScroll={({ target }: { target: any }) => {
                const { clientHeight, scrollTop, scrollHeight } = target;
                if (Number(scrollTop) + clientHeight >= scrollHeight - 20 && currentSearchRef.current.trim()) {
                    loadOptions(currentSearchRef.current, true);
                }
            }}
            {...selectProps}
            loading={loading}
            options={userSelections}
        ></Select>
    );

    return {
        selectNode,
        historyUserOptionsDict,
        loading,
        setUserSelections,
    };
}
