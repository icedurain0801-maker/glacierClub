import { Dictionary } from 'lodash';

import {
    BoardDataType,
    ClubDeployVersionValues,
    ENCYCLOPEDIA_VISIBLE,
    ExtendConfig,
    MOMENT_TYPE,
    OPEN_MODE,
    PUBLICITYVISIBILE,
    SECTION_MODE,
    SECTION_TYPE,
} from '@ts/club';
import { IS_ENABLE } from '@ts/enum/enum';

export enum RULE_ACTION {
    Post = 0, // 发帖
    Comment = 1, // 评论
    ThumsUp = 2, // 点赞
    Top = 3, // 置顶
    Digest = 4, // 加精
    Like = 5, // 获赞
    View = 6, // 浏览
    Collected = 105, // 被收藏
    DelPost = 100, // 被删帖
    DelComment = 101, // 被删评
    Forbidden = 102, // 被禁用
    ShareCdk = 8, // 分享(兑换码中心)
    Recommend = 9, // 推荐
}
export enum BASIC_CHECK_STATUS {
    Close,
    Open,
}
export const ActionsKeys: { [k in RULE_ACTION]: string } = {
    0: '发帖',
    1: '评论',
    2: '点赞',
    3: '置顶',
    4: '加精',
    5: '获赞',
    6: '浏览',
    105: '被收藏',
    100: '被删帖',
    101: '被删评',
    102: '被禁用',
    8: '分享（兑换码中心）',
    9: '推荐',
};
export enum RULE_CYCLE {
    Day = 0,
    Week = 1,
    Month = 2,
    Year = 3,
    Total = 4,
}
export const CycleKeys: { [k in RULE_CYCLE]: string } = {
    0: '每日',
    1: '每周',
    2: '每月',
    3: '每年',
    4: '总计',
};
export const CycleOptions = [
    { label: CycleKeys[RULE_CYCLE.Day], value: RULE_CYCLE.Day },
    { label: CycleKeys[RULE_CYCLE.Week], value: RULE_CYCLE.Week },
    // { label: CycleKeys[RULE_CYCLE.Month], value: RULE_CYCLE.Month },
    // { label: CycleKeys[RULE_CYCLE.Year], value: RULE_CYCLE.Year },
    { label: CycleKeys[RULE_CYCLE.Total], value: RULE_CYCLE.Total },
];

export enum CATEGORY {
    ForumCoin = 0,
    Experience = 1,
}

interface FrontBoardDataType extends BoardDataType {
    parentId: number;
    toolMode: boolean;
    forumCoinAddRules: CoinAddRules[];
    forumCoinExpendRules: CoinAddRules[];
    experienceRules: CoinAddRules[];
    growthSystemEnable: number;
    growthSystems: (GrowthSystemsItemType & { expCopy: number })[];
    extendConfig: ExtendConfig;
}
interface CoinAddRules {
    id?: number;
    category: number;
    type: number;
    cycle: number;
    cycleValue: number;
    value: number;
    upperLimit: number;
}

export let defaultData: FrontBoardDataType = {
    clubDeployVersion: ClubDeployVersionValues[0],
    name: '',
    imageUrl: '',
    imageUrlVisible: 1,
    encyclopediaVisible: ENCYCLOPEDIA_VISIBLE.Close,
    publicityVisible: PUBLICITYVISIBILE.Close,
    creatorEnable: PUBLICITYVISIBILE.Close,
    findEnable: IS_ENABLE.Unable,
    encyclopediaIsSubmittable: IS_ENABLE.Unable,
    badgeEnabled: IS_ENABLE.Unable,
    quickCommentEnable: IS_ENABLE.Unable,
    publicityLabel: '',
    publicityIcon: '',
    translateEnable: PUBLICITYVISIBILE.Close,
    games: [],
    sectionMode: [ SECTION_MODE.IsGame ],
    parentId: 0,
    sections: [
        {
            name: '',
            isAdmin: BASIC_CHECK_STATUS.Close,
            status: BASIC_CHECK_STATUS.Open,
            sort: BASIC_CHECK_STATUS.Open,
            type: MOMENT_TYPE.Post,
            children: [
                {
                    name: '',
                    isAdmin: BASIC_CHECK_STATUS.Close,
                    status: BASIC_CHECK_STATUS.Open,
                    sort: BASIC_CHECK_STATUS.Open,
                    allEnable: BASIC_CHECK_STATUS.Open,
                    defaultShare: BASIC_CHECK_STATUS.Open,
                    type: MOMENT_TYPE.Post,
                    isSubmittable: 0,
                },
            ],
            multiLang: { 'en-US': { name: '' } }, // 海外用
        },
    ],
    toolbar: [
        {
            name: '',
            icon: '',
            url: '', // "https://q1-operation-bulletin.oss-cn-beijing.aliyuncs.com/CLUB/2022/09/06/1662458740198400c4b30-6661-4dd6-95ad-087d45dea580.png"
            isLogin: 0,
            notificationMember: false,
            sort: 1,
            multiLang: { 'en-US': { name: '' } }, // 海外用
        },
    ],
    toolMode: true,
    forumCoinAddRules: [
        {
            id: undefined,
            category: CATEGORY.ForumCoin,
            type: RULE_ACTION.Post,
            cycle: RULE_CYCLE.Day,
            cycleValue: 1,
            value: 0,
            upperLimit: 0,
        },
        {
            id: undefined,
            category: CATEGORY.ForumCoin,
            type: RULE_ACTION.Comment,
            cycle: RULE_CYCLE.Day,
            cycleValue: 1,
            value: 0,
            upperLimit: 0,
        },
        {
            id: undefined,
            category: CATEGORY.ForumCoin,
            type: RULE_ACTION.ThumsUp,
            cycle: RULE_CYCLE.Day,
            cycleValue: 1,
            value: 0,
            upperLimit: 0,
        },
        {
            id: undefined,
            category: CATEGORY.ForumCoin,
            type: RULE_ACTION.Top,
            cycle: RULE_CYCLE.Day,
            cycleValue: 1,
            value: 0,
            upperLimit: 0,
        },
        {
            id: undefined,
            category: CATEGORY.ForumCoin,
            type: RULE_ACTION.Digest,
            cycle: RULE_CYCLE.Day,
            cycleValue: 1,
            value: 0,
            upperLimit: 0,
        },
        {
            id: undefined,
            category: CATEGORY.ForumCoin,
            type: RULE_ACTION.Recommend,
            cycle: RULE_CYCLE.Day,
            cycleValue: 1,
            value: 0,
            upperLimit: 0,
        },
        {
            id: undefined,
            category: CATEGORY.ForumCoin,
            type: RULE_ACTION.ShareCdk,
            cycle: RULE_CYCLE.Day,
            cycleValue: 1,
            value: 0,
            upperLimit: 0,
        },
    ],
    forumCoinExpendRules: [
        {
            id: undefined,
            category: CATEGORY.ForumCoin,
            type: RULE_ACTION.DelPost,
            cycle: RULE_CYCLE.Day,
            cycleValue: 1,
            value: 0,
            upperLimit: 0,
        },
        {
            id: undefined,
            category: CATEGORY.ForumCoin,
            type: RULE_ACTION.DelComment,
            cycle: RULE_CYCLE.Day,
            cycleValue: 1,
            value: 0,
            upperLimit: 0,
        },
        {
            id: undefined,
            category: CATEGORY.ForumCoin,
            type: RULE_ACTION.Forbidden,
            cycle: RULE_CYCLE.Day,
            cycleValue: 1,
            value: 0,
            upperLimit: 0,
        },
    ],
    experienceRules: [
        {
            id: undefined,
            category: CATEGORY.Experience,
            type: RULE_ACTION.Post,
            cycle: RULE_CYCLE.Day,
            cycleValue: 1,
            value: 0,
            upperLimit: 0,
        },
        {
            id: undefined,
            category: CATEGORY.Experience,
            type: RULE_ACTION.Comment,
            cycle: RULE_CYCLE.Day,
            cycleValue: 1,
            value: 0,
            upperLimit: 0,
        },
        {
            id: undefined,
            category: CATEGORY.Experience,
            type: RULE_ACTION.ThumsUp,
            cycle: RULE_CYCLE.Day,
            cycleValue: 1,
            value: 0,
            upperLimit: 0,
        },
        {
            id: undefined,
            category: CATEGORY.Experience,
            type: RULE_ACTION.Top,
            cycle: RULE_CYCLE.Day,
            cycleValue: 1,
            value: 0,
            upperLimit: 0,
        },
        {
            id: undefined,
            category: CATEGORY.Experience,
            type: RULE_ACTION.Digest,
            cycle: RULE_CYCLE.Day,
            cycleValue: 1,
            value: 0,
            upperLimit: 0,
        },
        {
            id: undefined,
            category: CATEGORY.Experience,
            type: RULE_ACTION.Like,
            cycle: RULE_CYCLE.Day,
            cycleValue: 1,
            value: 0,
            upperLimit: 0,
        },
        {
            id: undefined,
            category: CATEGORY.Experience,
            type: RULE_ACTION.View,
            cycle: RULE_CYCLE.Day,
            cycleValue: 1,
            value: 0,
            upperLimit: 0,
        },
        {
            id: undefined,
            category: CATEGORY.Experience,
            type: RULE_ACTION.Collected,
            cycle: RULE_CYCLE.Day,
            cycleValue: 1,
            value: 0,
            upperLimit: 0,
        },
        {
            id: undefined,
            category: CATEGORY.Experience,
            type: RULE_ACTION.Recommend,
            cycle: RULE_CYCLE.Day,
            cycleValue: 1,
            value: 0,
            upperLimit: 0,
        },
        {
            id: undefined,
            category: CATEGORY.Experience,
            type: RULE_ACTION.ShareCdk,
            cycle: RULE_CYCLE.Day,
            cycleValue: 1,
            value: 0,
            upperLimit: 0,
        },
    ],
    growthSystemEnable: 0,
    growthSystems: [ { level: 1, exp: 0, expCopy: 0, title: 0, goods: [], message: '', multiLang: { 'en-US': '' } } ],
    holidaySkinEnabled: BASIC_CHECK_STATUS.Close,
    startupPageUrl: '',
    homeUrl: '',
    newseUrl: '',
    playerCircleUrl: '',
    myImageUrl: '',
    postUrl: '',
    rewardTaskUrl: '',
    robotEnable: IS_ENABLE.Unable,
    robotImageUrl: '',
    prompts: null,
    postPrompt: '',
    gamePrompt: '',
    contentPrompt: '',
    dynamicPrompt: '',
    aiProbability: undefined,
    answerProbability: undefined,
    openMode: OPEN_MODE.Default,
    normalImage: '',
    greetImage: '',
    petImage: '',
    extendConfig: {
        introduce: '',
        downloadEnable: 0,
        cdkEnable: 0,
        iosDownloadLink: '',
        iosPageckName: '',
        androidDownloadLink: '',
        androidPageckName: '',
        cdks: [],
        actorBindEnable: 0,
        actorBindTypes: [],
        phoneBindEnable: 0,
        clubAndroidDownloadLink: '',
        clubAndroidPackageName: '',
        clubIosDownloadLink: '',
        clubIosPackageName: '',
        goods: [],
        clubDownloadEnable: 0,
        sectionType: SECTION_TYPE.Basic,
    },
};
export enum MEMBER_REWARD_LABEL_ENUM {
    None,
    Rookie,
    Spark,
    Sky,
}
export const MemberShipLabel = {
    [MEMBER_REWARD_LABEL_ENUM.None]: '无',
    [MEMBER_REWARD_LABEL_ENUM.Rookie]: '新芽',
    [MEMBER_REWARD_LABEL_ENUM.Spark]: '星火',
    [MEMBER_REWARD_LABEL_ENUM.Sky]: '苍穹',
};
export const MemberShipTitleOptions = [
    { value: MEMBER_REWARD_LABEL_ENUM.None, label: MemberShipLabel[MEMBER_REWARD_LABEL_ENUM.None] },
    { value: MEMBER_REWARD_LABEL_ENUM.Rookie, label: MemberShipLabel[MEMBER_REWARD_LABEL_ENUM.Rookie] },
    { value: MEMBER_REWARD_LABEL_ENUM.Spark, label: MemberShipLabel[MEMBER_REWARD_LABEL_ENUM.Spark] },
    { value: MEMBER_REWARD_LABEL_ENUM.Sky, label: MemberShipLabel[MEMBER_REWARD_LABEL_ENUM.Sky] },
];
export interface GrowthSystemsItemType {
    id?: number; // 新增无次字段
    level: number;
    exp: number;
    title: number;
    goods: RewardFormData[];
    message: string;
    multiLang?: Dictionary<string>;
}
export interface RewardFormData {
    type: REWARD_FORM_TYPE_ENUM;
    id: number;
    num: number;
    childType?: number;
}
export enum REWARD_FORM_TYPE_ENUM {
    Prop,
    Point,
    Exp,
    Dressup,
}
export const RewardLabel = {
    [REWARD_FORM_TYPE_ENUM.Prop]: '游戏道具',
    [REWARD_FORM_TYPE_ENUM.Point]: '会员积分',
    [REWARD_FORM_TYPE_ENUM.Exp]: '经验值',
    [REWARD_FORM_TYPE_ENUM.Dressup]: '个性装扮',
};
export const RewardTypeOptions = [
    { value: REWARD_FORM_TYPE_ENUM.Point, label: RewardLabel[REWARD_FORM_TYPE_ENUM.Point] },
    { value: REWARD_FORM_TYPE_ENUM.Exp, label: RewardLabel[REWARD_FORM_TYPE_ENUM.Exp] },
];

// 有个性装扮
export const RewardTypeOptionsWithDressup = [
    ...RewardTypeOptions,
    { value: REWARD_FORM_TYPE_ENUM.Dressup, label: RewardLabel[REWARD_FORM_TYPE_ENUM.Dressup] },
];
