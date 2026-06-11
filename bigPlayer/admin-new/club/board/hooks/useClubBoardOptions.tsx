import { useMemo } from 'react';
import type { BoardPermitOptionsType } from '@ts/club';

const mockBoards = [
  { id: 1, label: '\u9ed8\u8ba4\u7248\u5757', value: 'zh&&1', deployVersionId: 'zh', status: 1 },
  { id: 2, label: '\u6e38\u620f\u8ba8\u8bba', value: 'zh&&2', deployVersionId: 'zh', status: 1 },
  { id: 3, label: 'General', value: 'en&&3', deployVersionId: 'en', status: 1 },
  { id: 4, label: 'Gameplay', value: 'en&&4', deployVersionId: 'en', status: 1 },
];

export function usePremitClubBoard(): {
  clubBoardOptions: BoardPermitOptionsType[];
  boardDictForPermit: Record<string, any>;
} {
  const clubBoardOptions = useMemo<BoardPermitOptionsType[]>(
    () => [
      {
        label: '\u56fd\u5185 (zh)',
        value: 'zh',
        children: mockBoards.slice(0, 2).map(({ id, label, value }) => ({ id, label, value })),
      },
      {
        label: '\u6d77\u5916 (en)',
        value: 'en',
        children: mockBoards.slice(2).map(({ id, label, value }) => ({ id, label, value })),
      },
    ],
    []
  );

  const boardDictForPermit: Record<string, any> = useMemo(
    () =>
      mockBoards.reduce<Record<string, any>>((dict, board) => {
        dict[String(board.id)] = board;
        dict[board.value] = board;
        return dict;
      }, {}),
    []
  );

  return { clubBoardOptions, boardDictForPermit };
}
