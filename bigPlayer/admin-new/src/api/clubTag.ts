const ok = (data: any = null, total?: number) =>
  Promise.resolve({ data, total: total ?? (Array.isArray(data) ? data.length : 0), code: 0, msg: '' });

const tagSettings = [
  {
    id: 1,
    name: 'High Value',
    chargeType: 1,
    createdAt: '2026-06-04 10:00:00',
    updateTime: '2026-06-04 10:00:00',
    boardId: 1,
  },
  {
    id: 2,
    name: 'New User',
    chargeType: 2,
    createdAt: '2026-06-04 10:00:00',
    updateTime: '2026-06-04 10:00:00',
    boardId: 1,
  },
];

export const getTagList = (..._args: any[]) =>
  ok([
    { id: 1, name: 'High Value', tags: JSON.stringify(['spender', 'active']), count: 120 },
    { id: 2, name: 'New User', tags: JSON.stringify(['fresh', 'tutorial']), count: 75 },
  ]);
export const createTag = (data: any) => ok(data);
export const updateTag = (data: any) => ok(data);
export const deleteTag = (id: number) => ok({ id });
export const getTagSettingList = (..._args: any[]) => ok(tagSettings);
export const getAllTagSettingList = (..._args: any[]) => ok(tagSettings);
export const createTagSetting = (data: any) => ok(data);
export const updateTagSetting = (data: any) => ok(data);
export const deleteTagSetting = (id: number) => ok({ id });
export const removeTagSetting = (id: number) => ok({ id });
export const downloadClubTagSettingList = (..._args: any[]) => ok('mock-tag-settings.csv');
export const validateTagNameExist = (..._args: any[]) => ok({ exists: false });
export const validateTagRangeExist = (..._args: any[]) => ok({ exists: false });
