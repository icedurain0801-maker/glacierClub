import { get, groupBy } from 'lodash';
import { useObserver } from 'mobx-react';

import { useContentRouteConfig, useStore } from '@/context';

import { ClubDeployVersionConstant, BoardPermitOptionsType, BoardPermitType } from '@ts/club';

/** 获取当前页面下的权限对应的版块信息 */
export function usePremitClubBoard(): {
    clubBoardOptions: BoardPermitOptionsType[];
    boardDictForPermit: { [key: string]: BoardPermitType };
} {
    const { Club } = useStore();

    let boardDictForPermit: any = useObserver(() => Club.boardDictForPermit);

    const { getRouteClubBoardData } = useStore();
    const routeConfig = useContentRouteConfig();

    let result = (getRouteClubBoardData(routeConfig) ?? []).map(x => x.id);

    let resultGroup = groupBy(
        result
            .map(x => {
                return boardDictForPermit[x];
            })
            .filter(Boolean),
        'deployVersionId'
    );

    const clubBoardOptions = Object.keys(resultGroup)
        .map(_key => {
            return {
                label: get(ClubDeployVersionConstant, _key, '???'),
                value: _key,
                children: resultGroup[_key],
            };
        })
        .filter(item => !!item?.children?.length);
    return { clubBoardOptions, boardDictForPermit };
}
