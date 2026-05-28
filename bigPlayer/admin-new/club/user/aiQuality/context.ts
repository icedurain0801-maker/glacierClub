import React from 'react';

import { QUALITY_TYPE } from '@ts/clubQuality';

export interface AiQualityQueryValues {
    boardId?: string;
    checkLevel?: string;
    startTime?: string;
    endTime?: string;
    [key: string]: unknown;
}

export interface AiQualityContextValue {
    tableType: QUALITY_TYPE;
    queryValues: AiQualityQueryValues;
    setQueryValues: React.Dispatch<React.SetStateAction<AiQualityQueryValues>>;
    queryVersion: number;
    setQueryVersion: React.Dispatch<React.SetStateAction<number>>;
}

const AiQualityContext = React.createContext<AiQualityContextValue | null>(null);

export function useAiQualityContext() {
    const context = React.useContext(AiQualityContext);

    if (!context) {
        throw new Error('useAiQualityContext must be used within AiQualityContext.Provider');
    }

    return context;
}

export default AiQualityContext;
