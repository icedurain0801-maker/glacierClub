import React, { createContext, useContext, useState, ReactNode, useMemo, useCallback, useEffect } from 'react';
import { Dictionary, keyBy } from 'lodash';

import { getAppConfigCenterList } from '@/api/configCenter';

import { CLUB_APP_ID, CLUB_ENVIRONMENT_ENUM } from '@ts/club';

export const DefaultLanguage = 'en-US';

interface BoardCreateContextType {
    clubDeployVersion: CLUB_ENVIRONMENT_ENUM;
    isEN: boolean;
    languageOptions: any[];
    languageDict: Dictionary<any>;
    boardId?: number;

    toolSelectedLanguages: string[];
    setToolSelectedLanguages: React.Dispatch<React.SetStateAction<string[]>>;
    sectionSelectedLanguages: string[];
    setSectionSelectedLanguages: React.Dispatch<React.SetStateAction<string[]>>;
    growthSystemLanguages: string[];
    setGrowthSystemLanguages: React.Dispatch<React.SetStateAction<string[]>>;

    toolActiveKey: string;
    setToolActiveKey: React.Dispatch<React.SetStateAction<string>>;
    sectionActiveKey: string;
    setSectionActiveKey: React.Dispatch<React.SetStateAction<string>>;
    growthActiveKey: string;
    setGrowthActiveKey: React.Dispatch<React.SetStateAction<string>>;
}

export const BoardCreateContext = createContext<BoardCreateContextType>({
    clubDeployVersion: CLUB_ENVIRONMENT_ENUM.ZH,
    isEN: false,
    languageOptions: [],
    languageDict: {},
    boardId: undefined,

    toolSelectedLanguages: [],
    setToolSelectedLanguages: () => {},
    sectionSelectedLanguages: [],
    setSectionSelectedLanguages: () => {},
    growthSystemLanguages: [],
    setGrowthSystemLanguages: () => {},

    toolActiveKey: '',
    setToolActiveKey: () => {},
    sectionActiveKey: '',
    setSectionActiveKey: () => {},
    growthActiveKey: '',
    setGrowthActiveKey: () => {},
});

export const BoardCreateProvider = function BoardCreateProvider(props: {
    children: ReactNode;
    clubDeployVersion: CLUB_ENVIRONMENT_ENUM;
    boardId?: number;
    toolSelectedLanguages: string[];
    setToolSelectedLanguages: React.Dispatch<React.SetStateAction<string[]>>;
    sectionSelectedLanguages: string[];
    setSectionSelectedLanguages: React.Dispatch<React.SetStateAction<string[]>>;
    growthSystemLanguages: string[];
    setGrowthSystemLanguages: React.Dispatch<React.SetStateAction<string[]>>;

    toolActiveKey: string;
    setToolActiveKey: React.Dispatch<React.SetStateAction<string>>;

    sectionActiveKey: string;
    setSectionActiveKey: React.Dispatch<React.SetStateAction<string>>;

    growthActiveKey: string;
    setGrowthActiveKey: React.Dispatch<React.SetStateAction<string>>;
}) {
    const {
        children,
        clubDeployVersion,
        boardId,
        toolSelectedLanguages,
        setToolSelectedLanguages,
        sectionSelectedLanguages,
        setSectionSelectedLanguages,
        growthSystemLanguages,
        setGrowthSystemLanguages,
        toolActiveKey,
        setToolActiveKey,
        sectionActiveKey,
        setSectionActiveKey,
        growthActiveKey,
        setGrowthActiveKey,
    } = props;
    const [ activeLanguageKey, setActiveLanguageKey ] = useState(DefaultLanguage);

    const [ languageOptions, setLanguageOptions ] = useState<
        Array<{
            label: string;
            value: number;
            code: string;
        }>
    >([]);

    const isEN = useMemo(() => clubDeployVersion === CLUB_ENVIRONMENT_ENUM.EN, [ clubDeployVersion ]);

    const fetchLanguages = useCallback(async () => {
        const res = await getAppConfigCenterList({
            appId: CLUB_APP_ID,
            tableName: 'LanguageClub',
        });
        if (res && res.length > 0) {
            const languageOptions = res
                .filter(item => item.code)
                .map(item => ({
                    label: item.language,
                    value: item.languageID,
                    code: item.code,
                }));
            setLanguageOptions(languageOptions);
        }
    }, []);

    const languageDict = useMemo(() => keyBy(languageOptions, 'code'), [ languageOptions ]);

    useEffect(() => {
        if (isEN) {
            fetchLanguages();
        }
    }, [ isEN, fetchLanguages ]);

    const value = useMemo(
        () => ({
            activeLanguageKey,
            setActiveLanguageKey,
            clubDeployVersion,
            isEN,
            languageOptions,
            languageDict,
            boardId,

            toolSelectedLanguages,
            setToolSelectedLanguages,
            sectionSelectedLanguages,
            setSectionSelectedLanguages,
            growthSystemLanguages,
            setGrowthSystemLanguages,

            toolActiveKey,
            setToolActiveKey,
            sectionActiveKey,
            setSectionActiveKey,
            growthActiveKey,
            setGrowthActiveKey,
        }),
        [
            activeLanguageKey,
            clubDeployVersion,
            isEN,
            languageOptions,
            languageDict,
            boardId,
            toolSelectedLanguages,
            setToolSelectedLanguages,
            sectionSelectedLanguages,
            setSectionSelectedLanguages,
            growthSystemLanguages,
            setGrowthSystemLanguages,
            toolActiveKey,
            setToolActiveKey,
            sectionActiveKey,
            setSectionActiveKey,
            growthActiveKey,
            setGrowthActiveKey,
        ]
    );

    return <BoardCreateContext.Provider value={value}>{children}</BoardCreateContext.Provider>;
};

// 封装一个 Hook 来安全地使用 Context
export function useBoardCreate() {
    const context = useContext(BoardCreateContext);
    if (!context) {
        throw new Error('useBoardCreate must be used within a BoardCreateProvider');
    }
    return context;
}
