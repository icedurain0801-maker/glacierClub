import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Button,
    Divider,
    Drawer,
    Form,
    FormInstance,
    Image,
    Input,
    InputNumber,
    message,
    Modal,
    Select,
    Spin,
    Space,
    Tabs,
    Tag,
} from 'antd';
import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { get, isEqual, isNumber, keyBy, map, sortBy } from 'lodash';

import { getBoardGameVersion, getAllDressUp } from '@/api/club';
import {
    createBadge,
    createBadgeName,
    getBadgeNamesList,
    removeBadgeName,
    updateBadge,
    verifyBadge,
} from '@/api/clubBadge';
import { getGameConfigCenterCompatible } from '@/api/configCenter';
import NumberSwitch from '@/components/NumberSwitch';
import GoodsInfoCmp, { GoodsOptionsType, ImageOptions } from '@/components/goodsInfo/GoodsInfo';
import UploadImg from '@/components/uploadFile/UploadImg';
import EditLine, { EditLineContext } from '@/components/editLine';
import AppearanceInfoComp from '@/pages/club/appearance/components/AppearanceInfoComp';
import { hasEmoji, inputEmojiRule } from '@/utils/helper';
import { getPathName } from '@/utils/lib';

import { APPROVAL_STATUS, DressUpListItem, DRESS_ENUM } from '@ts/appearance';
import { BoardPermitOptionsType, BOARD_PERMIT_SEPARATE, CLUB_DEPLOY_VERSION, CLUB_OSS_PREFIX } from '@ts/club';
import {
    BadgeCategoryListItem,
    BadgeConditionTypeEnum,
    BadgeConditionTypeOptions,
    BadgeConditionTypeSuffixMap,
    BadgeLevelOptions,
    BadgeRewardItem,
    BadgeRewardMultiLangType,
    EditBadgeData,
    NameMultiLangType,
    REWARD_ENUM,
} from '@ts/clubBadge';
import {
    Attachment,
    GOODID_KEY_COMBINATION,
    GOODID_KEY_DICT,
    GOODID_VALUE_SEPARATE,
    GoodIdKeyCombitDictType,
    GoodIdKeyDictType,
    GOODNAME_KEY_DICT,
    GoodNameKeyDictType,
    GOODS_KEY_MAX_DICT,
    GOODS_MAX_DEFAULT,
    GoodsKeyMaxDictType,
} from '@ts/email';
import { AuditStatus, OptionType } from '@ts/enum/enum';

import { getClubImageHost, useClubUploadOption } from '../../../board/hooks/useClubUploadOption';

import './Create.less';

interface ClubAppearanceCreateProps {
    clubBoardOptions: BoardPermitOptionsType[];
    clubDeployVersion: CLUB_DEPLOY_VERSION;
    data: EditBadgeData;
    visible: boolean;
    onOk(isJump: boolean): void;
    onClose(): void;
    languageOptions: Array<OptionType>;
    categoryList: Array<BadgeCategoryListItem>;
    langMap: { [k in string]: string };
}

interface BadgeFormMultiLang {
    language: string;
    nameId?: number;
    description?: string;
    rewardGoods?: Attachment[];
}

interface BadgeFormValues {
    multiLang: BadgeFormMultiLang[];
    level: number;
    iconUrl: string;
    categoryId: number;
    conditionType: BadgeConditionTypeEnum;
    conditionValue: number;
    sort: number;
    hasOpenReward?: 0 | 1;
    rewardGoods?: Attachment[];
}

interface BadgeRewardSelectorProps {
    value?: Attachment[];
    onChange?: (value?: Attachment[]) => void;
    goodsOptions: GoodsOptionsType[];
    goodsOptionsLoading?: boolean;
    goodsImageOptions?: ImageOptions;
    dressUpData: DressUpListItem[];
    lang: string;
    resolveImageUrl: (url?: string) => string;
}

const DEFAULT_HOME_LANG = 'zh-CN';
const DEFAULT_INTL_LANGS = [ 'en-US', 'zh-CN' ];
const BADGE_REWARD_MAX_COUNT = 5;
const REWARD_TYPE_OPTIONS = [
    { label: '游戏道具', value: REWARD_ENUM.Prop },
    { label: '头像框', value: REWARD_ENUM.Dressup },
];

const isDressupReward = (item: Attachment) => {
    return item.goodsType === REWARD_ENUM.Dressup;
};

const normalizeRewardItem = (item: Attachment): Attachment => {
    const dressup = item.goodsType === REWARD_ENUM.Dressup;
    const normalized = {
        ...item,
        goodsType: dressup ? REWARD_ENUM.Dressup : REWARD_ENUM.Prop,
    };
    if (!dressup) {
        delete normalized.childType;
        return normalized;
    }
    return {
        ...normalized,
        childType: DRESS_ENUM.Avatar,
    };
};

const getRewardTagKey = (item: Attachment) => {
    return `${String(item.goodsId)}_${item.goodsNum}_${item.goodsType || ''}_${item.childType || ''}`;
};

const getInitialLanguages = (isHomeLand: boolean) => (isHomeLand ? [ DEFAULT_HOME_LANG ] : [ ...DEFAULT_INTL_LANGS ]);

const getInitialMultiLang = (isHomeLand: boolean): BadgeFormMultiLang[] => {
    return getInitialLanguages(isHomeLand).map(language => ({
        language,
        rewardGoods: [],
    }));
};

const BadgeRewardSelector = ({
    value = [],
    onChange,
    goodsOptions,
    goodsOptionsLoading = false,
    goodsImageOptions,
    dressUpData,
    lang,
    resolveImageUrl,
}: BadgeRewardSelectorProps) => {
    const [ rewardType, setRewardType ] = useState<REWARD_ENUM>(REWARD_ENUM.Prop);
    const normalizedRewards = useMemo(() => value.map(normalizeRewardItem), [ value ]);
    const propRewards = useMemo(() => normalizedRewards.filter(item => !isDressupReward(item)), [ normalizedRewards ]);
    const dressupRewards = useMemo(() => normalizedRewards.filter(isDressupReward), [ normalizedRewards ]);
    const propMaxGoodsLength = useMemo(() => Math.max(BADGE_REWARD_MAX_COUNT - dressupRewards.length, 0), [
        dressupRewards.length,
    ]);
    const dressupMaxGoodsLength = useMemo(() => Math.max(BADGE_REWARD_MAX_COUNT - propRewards.length, 0), [
        propRewards.length,
    ]);

    const handlePropChange = useCallback(
        (nextValue?: Attachment[]) => {
            onChange?.([
                ...dressupRewards,
                ...(nextValue || []).map(item => normalizeRewardItem({ ...item, goodsType: REWARD_ENUM.Prop })),
            ]);
        },
        [ dressupRewards, onChange ]
    );

    const handleDressupChange = useCallback(
        (nextValue: Attachment[]) => {
            onChange?.([
                ...propRewards,
                ...(nextValue || []).map(item =>
                    normalizeRewardItem({
                        ...item,
                        goodsType: REWARD_ENUM.Dressup,
                        childType: DRESS_ENUM.Avatar,
                    })
                ),
            ]);
        },
        [ onChange, propRewards ]
    );

    const handleRemove = useCallback(
        (target: Attachment) => {
            onChange?.(
                value.filter(item => {
                    return !(
                        String(item.goodsId) === String(target.goodsId) &&
                        (item.goodsType || REWARD_ENUM.Prop) === (target.goodsType || REWARD_ENUM.Prop) &&
                        (item.childType || 0) === (target.childType || 0)
                    );
                })
            );
        },
        [ onChange, value ]
    );

    return (
        <div style={{ width: '100%' }}>
            <Space align="start" wrap style={{ width: '100%' }}>
                <Select
                    style={{ width: 120 }}
                    value={rewardType}
                    onChange={(nextValue: REWARD_ENUM) => setRewardType(nextValue)}
                >
                    {REWARD_TYPE_OPTIONS.map(option => (
                        <Select.Option key={option.value} value={option.value} disabled={false}>
                            {option.label}
                        </Select.Option>
                    ))}
                </Select>
                {rewardType === REWARD_ENUM.Prop ? (
                    <GoodsInfoCmp
                        maxGoodsLength={propMaxGoodsLength}
                        goodsOptionsLoading={goodsOptionsLoading}
                        goodsOptions={goodsOptions}
                        imageOptions={goodsImageOptions}
                        precision={0}
                        tagHide={true}
                        singleGoodsMax={99999}
                        value={propRewards}
                        onChange={handlePropChange}
                    />
                ) : (
                    <AppearanceInfoComp
                        value={dressupRewards}
                        onChange={handleDressupChange as any}
                        maxGoodsLength={dressupMaxGoodsLength}
                        dressUpData={dressUpData}
                        defaultDressType={DRESS_ENUM.Avatar}
                        hideDressTypeSelect={true}
                        lang={lang}
                        resolveImageUrl={resolveImageUrl}
                    />
                )}
            </Space>
            <div className="club-badge-goods-list">
                {value.map(item => {
                    const text = `${item.goodsName}，数量：${item.goodsNum}`;
                    return (
                        <div className="goods-item" key={getRewardTagKey(item)}>
                            <div className="goods-img">
                                {item.goodsPic ? (
                                    <Image width={60} height={60} src={item.goodsPic} />
                                ) : (
                                    <div className="empty-pic-box">暂无图片</div>
                                )}
                                <CloseOutlined className="close-btn" onClick={() => handleRemove(item)} />
                            </div>
                            <Tag color="blue" style={{ marginTop: 10 }}>
                                {text}
                            </Tag>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const MAX_BADGE_NAME_LENGTH = 50;

export default function ClubAppearanceCreate(props: ClubAppearanceCreateProps) {
    const [ modalForm ] = Form.useForm<BadgeFormValues>();
    const { clubDeployVersion, data, visible, onClose, languageOptions, categoryList, langMap, onOk } = props;
    const [ loading, setLoading ] = useState(false);
    const [ initLoading, setInitLoading ] = useState(false);
    const [ rewardSourceLoading, setRewardSourceLoading ] = useState(false);
    const [ hasOpenReward, setHasOpenReward ] = useState<0 | 1>(0);
    const [ savedRewardSnapshot, setSavedRewardSnapshot ] = useState<{
        goods: BadgeRewardItem[];
        goodsMultiLang: BadgeRewardMultiLangType;
    }>({
        goods: [],
        goodsMultiLang: {},
    });
    const [ badgeNameOptions, setBadgeNameOptions ] = useState<{ label: string; value: number; lang: string }[]>([]);
    const [ badgeNameValue, setBadgeNameValue ] = useState('');
    const [ selectedLanguages, setSelectedLanguages ] = useState<string[]>([]);
    const [ activeKey, setActiveKey ] = useState(DEFAULT_HOME_LANG);
    const [ goodsOptions, setGoodsOptions ] = useState<GoodsOptionsType[]>([]);
    const [ multiLanguageGoodsInfo, setMultiLanguageGoodsInfo ] = useState<any[]>([]);
    const [ goodsInfoDict, setGoodsInfoDict ] = useState<Record<string, any>>({});
    const [ boardGameVersion, setBoardGameVersion ] = useState<{ gameId: number; gameVersion: string } | null>(null);
    const [ dressUpData, setDressUpData ] = useState<DressUpListItem[]>([]);

    const rewardSyncRef = useRef(false);
    const submitRef = useRef(false);
    const ClubUploadOption = useClubUploadOption({ clubDeployVersion });
    const isCreate = useMemo(() => !data?.id, [ data ]);
    const isHomeLand = useMemo(() => data?.boardId?.startsWith('zh'), [ data ]);
    const defaultActiveLang = isHomeLand ? DEFAULT_HOME_LANG : DEFAULT_INTL_LANGS[0];
    const boardId = useMemo(() => data?.boardId?.split(BOARD_PERMIT_SEPARATE)[1], [ data ]);
    const numericBoardId = useMemo(() => Number(boardId || 0), [ boardId ]);
    const clubImageHost = useMemo(() => getClubImageHost(clubDeployVersion), [ clubDeployVersion ]);

    const categoryOptions = useMemo(() => (categoryList ?? []).map(item => ({ label: item.name, value: item.id })), [
        categoryList,
    ]);
    const categoryListDict = useMemo(() => keyBy(categoryList, 'id'), [ categoryList ]);
    const badgeNameOptionsDict = useMemo(() => keyBy(badgeNameOptions, 'value'), [ badgeNameOptions ]);
    const multiLanguageGoodsDict = useMemo(() => keyBy(multiLanguageGoodsInfo, item => String(item.GoodsId)), [
        multiLanguageGoodsInfo,
    ]);
    const dressUpDict = useMemo(() => keyBy(dressUpData, item => String(item.id)), [ dressUpData ]);
    const groupEditLineContextValue = useMemo(() => ({ active: false }), []);

    const toRelativeImagePath = useCallback((url?: string) => {
        const raw = String(url || '').trim();
        if (!raw) {
            return '';
        }
        const pathname = /^https?:\/\//i.test(raw) ? getPathName(raw) : raw;
        return String(pathname || '').replace(/^\/+/, '');
    }, []);

    const toAbsoluteClubImage = useCallback(
        (url?: string) => {
            const raw = String(url || '').trim();
            if (!raw) {
                return '';
            }
            if (/^https?:\/\//i.test(raw)) {
                return raw;
            }
            return `${clubImageHost}${raw.replace(/^\/+/, '')}`;
        },
        [ clubImageHost ]
    );

    const getGoodsNameFields = useCallback((lang: string) => {
        const normalized = String(lang || '')
            .trim()
            .toLowerCase();

        switch (normalized) {
            case 'zh-cn':
                return [ 'zhCNGoodsName', 'enUSGoodsName' ];
            case 'zh-tw':
            case 'zh-hk':
                return [ 'zhHKGoodsName', 'zhTWGoodsName', 'zhCNGoodsName', 'enUSGoodsName' ];
            case 'ko-kr':
                return [ 'koKRGoodsName', 'enUSGoodsName', 'zhCNGoodsName' ];
            case 'ja-jp':
                return [ 'jaJPGoodsName', 'enUSGoodsName', 'zhCNGoodsName' ];
            case 'en-us':
            default:
                return [ 'enUSGoodsName', 'zhCNGoodsName' ];
        }
    }, []);

    const getTranslatedGoodsName = useCallback(
        (goodsId: Attachment['goodsId'], lang: string, fallback?: string) => {
            const keys = getGoodsNameFields(lang);
            for (const key of keys) {
                const value = get(multiLanguageGoodsDict, [ String(goodsId), key ]);
                if (value) {
                    return value as string;
                }
            }
            return fallback || '';
        },
        [ getGoodsNameFields, multiLanguageGoodsDict ]
    );

    const getDressupDisplayName = useCallback(
        (goodsId: Attachment['goodsId'], lang: string, fallback?: string) => {
            const item = dressUpDict[String(goodsId)];
            if (!item) {
                return fallback || '';
            }

            const normalizedLang = String(lang || '')
                .trim()
                .toLowerCase();
            const findName = (language: string) =>
                item.dressUpInfos.find(info => {
                    return (
                        String(info.language || '')
                            .trim()
                            .toLowerCase() === String(language).trim().toLowerCase()
                    );
                })?.dressName;

            const candidates = [ normalizedLang ];
            if (normalizedLang.startsWith('zh-') && normalizedLang !== 'zh-cn') {
                candidates.push('zh-cn');
            }
            candidates.push('en-us', 'zh-cn');

            const name = candidates.map(findName).find(Boolean) || fallback || '名称错误';
            const expiredText = item.expiredDay ? `${item.expiredDay}天` : '永久';
            return `${name}-${expiredText}（${item.id}）`;
        },
        [ dressUpDict ]
    );

    const translateRewardGoods = useCallback(
        (rewardGoods: Attachment[] = [], lang: string) => {
            return rewardGoods.map(item => {
                const dressup = isDressupReward(item);
                return {
                    ...item,
                    goodsType: dressup ? REWARD_ENUM.Dressup : REWARD_ENUM.Prop,
                    childType: dressup ? DRESS_ENUM.Avatar : item.childType,
                    goodsName: dressup
                        ? getDressupDisplayName(item.goodsId, lang, item.goodsName)
                        : getTranslatedGoodsName(item.goodsId, lang, item.goodsName),
                };
            });
        },
        [ getDressupDisplayName, getTranslatedGoodsName ]
    );

    const buildSubmitRewardGoods = useCallback(
        (rewardGoods: Attachment[] = []) => {
            return rewardGoods.map<BadgeRewardItem>(item => ({
                id: item.goodsId,
                num: item.goodsNum,
                type: isDressupReward(item) ? REWARD_ENUM.Dressup : REWARD_ENUM.Prop,
                ...(isDressupReward(item) ? { childType: DRESS_ENUM.Avatar } : {}),
                image: toRelativeImagePath(
                    isDressupReward(item)
                        ? dressUpDict[String(item.goodsId)]?.iconUrl || item.goodsPic || ''
                        : item.goodsPic || ''
                ),
                name: item.goodsName || '',
            }));
        },
        [ dressUpDict, toRelativeImagePath ]
    );

    const getRewardGoodsOptions = useCallback(
        (lang: string) => {
            if (isHomeLand) {
                return goodsOptions;
            }

            const nameKeys = getGoodsNameFields(lang);
            return (multiLanguageGoodsInfo || []).map(item => ({
                id: item.GoodsId,
                name: (nameKeys.map(key => get(item, key)).find(Boolean) ||
                    item.GoodsName ||
                    item.name ||
                    String(item.GoodsId)) as string,
            }));
        },
        [ getGoodsNameFields, goodsOptions, isHomeLand, multiLanguageGoodsInfo ]
    );

    const goodsImageOptions = useMemo<ImageOptions | undefined>(() => {
        if (!boardGameVersion) {
            return undefined;
        }
        return {
            _host: clubImageHost.replace(/\/$/, ''),
            gameId: boardGameVersion.gameId,
            gameVersion: boardGameVersion.gameVersion,
            goodsInfoDict,
            urlPrefix: CLUB_OSS_PREFIX,
        };
    }, [ boardGameVersion, clubImageHost, goodsInfoDict ]);

    const refreshRewardSource = useCallback(async () => {
        if (!numericBoardId) {
            setGoodsOptions([]);
            setMultiLanguageGoodsInfo([]);
            setGoodsInfoDict({});
            setBoardGameVersion(null);
            setDressUpData([]);
            return;
        }

        setRewardSourceLoading(true);
        try {
            const [ versionRes, dressRes ] = await Promise.all([
                getBoardGameVersion({ id: numericBoardId }, clubDeployVersion).catch(() => null),
                getAllDressUp(numericBoardId, clubDeployVersion).catch(() => ({ data: [] } as any)),
            ]);

            const avatarDressups = ((dressRes?.data || []) as DressUpListItem[])
                .filter(
                    item => item.approvalStatus === APPROVAL_STATUS.Approval && item.dressType === DRESS_ENUM.Avatar
                )
                .map(item => ({
                    ...item,
                    iconUrl: toAbsoluteClubImage(item.iconUrl),
                }));
            setDressUpData(avatarDressups);

            if (!(versionRes?.code === 0) || !versionRes?.data?.length) {
                setGoodsOptions([]);
                setMultiLanguageGoodsInfo([]);
                setGoodsInfoDict({});
                setBoardGameVersion(null);
                return;
            }

            const { gameId, gameVersion } = versionRes.data[0];
            setBoardGameVersion({ gameId, gameVersion });
            if (isHomeLand) {
                const result = await getGameConfigCenterCompatible({
                    tableName: 'GoodsInfo',
                    gameId,
                    gameVersion,
                });
                const source = result.data || [];
                const transformed = source.map(item => {
                    const isCombinationKey = gameId in GOODID_KEY_COMBINATION;
                    const hasDefaultKey = gameId in GOODID_KEY_DICT;
                    return {
                        id: isCombinationKey
                            ? GOODID_KEY_COMBINATION[(gameId as unknown) as GoodIdKeyCombitDictType]
                                  .map(key => item?.[key])
                                  .join(GOODID_VALUE_SEPARATE)
                            : item?.[
                                  hasDefaultKey
                                      ? GOODID_KEY_DICT[(gameId as unknown) as GoodIdKeyDictType]
                                      : GOODID_KEY_DICT.default
                              ],
                        name:
                            item?.[
                                gameId in GOODNAME_KEY_DICT
                                    ? GOODNAME_KEY_DICT[(gameId as unknown) as GoodNameKeyDictType]
                                    : GOODNAME_KEY_DICT.default
                            ] || '',
                        max:
                            item?.[
                                gameId in GOODS_KEY_MAX_DICT
                                    ? GOODS_KEY_MAX_DICT[(gameId as unknown) as GoodsKeyMaxDictType]
                                    : GOODS_KEY_MAX_DICT.default
                            ] ?? GOODS_MAX_DEFAULT,
                    };
                });
                setGoodsOptions(transformed);
                setGoodsInfoDict(
                    keyBy(
                        transformed.map((item, index) => ({ ...source[index], __badgeGoodsId: item.id })),
                        '__badgeGoodsId'
                    )
                );
                setMultiLanguageGoodsInfo([]);
                return;
            }

            const [ multiResult, goodsResult ] = await Promise.all([
                getGameConfigCenterCompatible({
                    gameId,
                    gameVersion,
                    dataVersion: '1',
                    tableName: 'MutiLanguageGoodsInfo',
                }),
                getGameConfigCenterCompatible({
                    gameId,
                    gameVersion,
                    tableName: 'GoodsInfo',
                }).catch(() => ({ data: [] } as any)),
            ]);
            const goodsInfoSource = goodsResult?.data || [];
            const goodsInfoMap: Record<string, any> = {};
            for (const item of goodsInfoSource) {
                const isCombinationKey = gameId in GOODID_KEY_COMBINATION;
                const hasDefaultKey = gameId in GOODID_KEY_DICT;
                const id = isCombinationKey
                    ? GOODID_KEY_COMBINATION[(gameId as unknown) as GoodIdKeyCombitDictType]
                          .map(key => item?.[key])
                          .join(GOODID_VALUE_SEPARATE)
                    : item?.[
                          hasDefaultKey
                              ? GOODID_KEY_DICT[(gameId as unknown) as GoodIdKeyDictType]
                              : GOODID_KEY_DICT.default
                      ];
                if (id !== undefined && id !== null) {
                    goodsInfoMap[String(id)] = item;
                }
            }
            const source = (multiResult.data || []).map(item => ({
                ...(goodsInfoMap[String(item.GoodsId)] || {}),
                ...item,
                ...(item?.zhTWGoodsName && !item?.zhHKGoodsName ? { zhHKGoodsName: item.zhTWGoodsName } : {}),
            }));
            setMultiLanguageGoodsInfo(source);
            setGoodsInfoDict(keyBy(source, item => String(item.GoodsId)));
            setGoodsOptions([]);
        } finally {
            setRewardSourceLoading(false);
        }
    }, [ clubDeployVersion, isHomeLand, numericBoardId, toAbsoluteClubImage ]);

    const syncRewardTranslations = useCallback(() => {
        if (!visible) {
            return;
        }

        const values = modalForm.getFieldsValue(true) as BadgeFormValues;
        const fields: Array<{ name: (string | number)[] | string; value: any }> = [];
        if (isHomeLand) {
            const translatedRewards = translateRewardGoods(values.rewardGoods || [], DEFAULT_HOME_LANG);
            if (!isEqual(values.rewardGoods || [], translatedRewards)) {
                fields.push({ name: 'rewardGoods', value: translatedRewards });
            }
        } else {
            (values.multiLang || []).forEach((item, index) => {
                const translatedRewards = translateRewardGoods(item.rewardGoods || [], item.language);
                if (!isEqual(item.rewardGoods || [], translatedRewards)) {
                    fields.push({ name: [ 'multiLang', index, 'rewardGoods' ], value: translatedRewards });
                }
            });
        }

        if (fields.length) {
            rewardSyncRef.current = true;
            modalForm.setFields(fields);
            rewardSyncRef.current = false;
        }
    }, [ isHomeLand, modalForm, translateRewardGoods, visible ]);

    const syncMultiLangRewardGoods = useCallback(
        (sourceIndex: number, multiLangValues?: BadgeFormMultiLang[]) => {
            if (isHomeLand) {
                return;
            }

            const currentValues = (multiLangValues ||
                modalForm.getFieldValue('multiLang') ||
                []) as BadgeFormMultiLang[];
            if (!currentValues.length) {
                return;
            }

            const sourceRewardGoods = currentValues[sourceIndex >= 0 ? sourceIndex : 0]?.rewardGoods || [];
            const nextValues = currentValues.map((item, index) => ({
                ...item,
                rewardGoods: translateRewardGoods(sourceRewardGoods, item.language),
                sort: index,
            }));

            if (!isEqual(currentValues, nextValues)) {
                rewardSyncRef.current = true;
                modalForm.setFieldsValue({ multiLang: nextValues });
                rewardSyncRef.current = false;
            }
        },
        [ isHomeLand, modalForm, translateRewardGoods ]
    );

    const getBadgeNameList = useCallback(async () => {
        try {
            const result = await getBadgeNamesList({ boardId }, clubDeployVersion);
            if (result.code === 0) {
                const options = (result.data || []).map(item => ({
                    label: item.name,
                    value: item.id,
                    lang: item.lang,
                }));
                setBadgeNameOptions(options);
                return options;
            }
        } catch (error) {}

        return [];
    }, [ boardId, clubDeployVersion ]);

    const onAddValue = useCallback(
        async (language: string, value: string) => {
            if (value === '') {
                message.error('请输入');
                return;
            }
            if (hasEmoji(value)) {
                message.error('不能包含表情符号');
                return;
            }

            const { code, msg } = await createBadgeName(
                { boardId },
                { name: value, lang: language },
                clubDeployVersion
            );
            if (code === 0) {
                message.success('新建成功');
                setBadgeNameValue('');
                getBadgeNameList();
            } else {
                message.error(msg);
            }
        },
        [ boardId, clubDeployVersion, getBadgeNameList ]
    );

    const handleRemoveBadgeName = useCallback(
        async (id: number) => {
            const { code, msg } = await removeBadgeName({ boardId, id }, clubDeployVersion);
            if (code === 0) {
                message.success('删除成功');
                getBadgeNameList();
            } else {
                message.error(msg || '删除失败');
            }
        },
        [ boardId, clubDeployVersion, getBadgeNameList ]
    );

    const handleValuesChange = useCallback(
        (changedValues: Partial<BadgeFormValues>, allValues: BadgeFormValues) => {
            if (Object.prototype.hasOwnProperty.call(changedValues, 'hasOpenReward')) {
                setHasOpenReward(changedValues.hasOpenReward ?? 0);
            }

            if (rewardSyncRef.current) {
                return;
            }

            if (isHomeLand || !Array.isArray(changedValues.multiLang)) {
                return;
            }

            const hasRewardChange = changedValues.multiLang.some(
                item => item && Object.prototype.hasOwnProperty.call(item, 'rewardGoods')
            );
            if (!hasRewardChange) {
                return;
            }

            const sourceIndex = (allValues.multiLang || []).findIndex(item => item?.language === activeKey);
            syncMultiLangRewardGoods(sourceIndex, allValues.multiLang || []);
        },
        [ activeKey, isHomeLand, syncMultiLangRewardGoods ]
    );

    useEffect(() => {
        if (!visible) {
            return;
        }

        let cancelled = false;
        setSelectedLanguages(getInitialLanguages(isHomeLand));
        setActiveKey(defaultActiveLang);
        setHasOpenReward(0);
        setSavedRewardSnapshot({
            goods: [],
            goodsMultiLang: {},
        });
        modalForm.resetFields();

        const initializeForm = async () => {
            setInitLoading(true);
            try {
                await Promise.all([ getBadgeNameList(), refreshRewardSource() ]);
                if (cancelled) {
                    return;
                }

                if (!isCreate && data) {
                    const {
                        nameMultiLang,
                        descriptionMultiLang,
                        level,
                        iconUrl,
                        categoryId,
                        conditionType,
                        conditionValue,
                        sort,
                        goods,
                        hasOpenReward,
                        goodsMultiLang,
                    } = data;
                    const languages = sortBy(Object.keys(nameMultiLang), lang => nameMultiLang[lang].sort);
                    setSelectedLanguages(languages);
                    setActiveKey(languages[0] || defaultActiveLang);
                    setHasOpenReward(hasOpenReward);
                    setSavedRewardSnapshot({
                        goods: goods || [],
                        goodsMultiLang: goodsMultiLang || {},
                    });

                    modalForm.setFieldsValue({
                        multiLang: languages.map(language => ({
                            language,
                            nameId: nameMultiLang[language]?.nameId
                                ? Number(nameMultiLang[language].nameId)
                                : undefined,
                            description: descriptionMultiLang[language]?.name || undefined,
                            rewardGoods: (goodsMultiLang?.[language]?.goods || []).map(item => ({
                                goodsId: item.id as number,
                                goodsName: item.name,
                                goodsNum: item.num,
                                goodsPic: toAbsoluteClubImage(item.image),
                                goodsType: item.type,
                                childType: item.childType,
                            })),
                        })),
                        level,
                        iconUrl: toAbsoluteClubImage(iconUrl),
                        categoryId,
                        conditionType,
                        conditionValue,
                        sort,
                        hasOpenReward,
                        rewardGoods: (goods || []).map(item => ({
                            goodsId: item.id as number,
                            goodsName: item.name,
                            goodsNum: item.num,
                            goodsPic: toAbsoluteClubImage(item.image),
                            goodsType: item.type,
                            childType: item.childType,
                        })),
                    });
                    return;
                }

                modalForm.setFieldsValue({
                    hasOpenReward: 0,
                    rewardGoods: [],
                    multiLang: getInitialMultiLang(isHomeLand),
                });
                setHasOpenReward(0);
            } finally {
                if (!cancelled) {
                    setInitLoading(false);
                }
            }
        };

        initializeForm();

        return () => {
            cancelled = true;
            setInitLoading(false);
        };
    }, [
        data,
        defaultActiveLang,
        getBadgeNameList,
        isCreate,
        isHomeLand,
        modalForm,
        refreshRewardSource,
        toAbsoluteClubImage,
        visible,
    ]);

    useEffect(() => {
        syncRewardTranslations();
    }, [ syncRewardTranslations, goodsOptions, multiLanguageGoodsInfo, dressUpData ]);

    // eslint-disable-next-line complexity
    const handleSubmit = useCallback(async () => {
        submitRef.current = true;
        try {
            setLoading(true);
            const {
                iconUrl,
                multiLang: rawMultiLang = [],
                hasOpenReward: openReward = 0,
                rewardGoods = [],
                ...rest
            } = await modalForm.validateFields();
            const currentBoardId = data!.boardId.split(BOARD_PERMIT_SEPARATE)[1];
            const query = { boardId: currentBoardId };
            const multiLang = keyBy(rawMultiLang, 'language');
            const nameId = isHomeLand ? multiLang[DEFAULT_HOME_LANG].nameId : multiLang[DEFAULT_INTL_LANGS[0]].nameId;
            const categoryId = rest.categoryId;
            const badgeLanguages = map(rawMultiLang, 'language');

            if (!isHomeLand) {
                const categoryItem = categoryListDict[categoryId];
                const languages = Object.keys(categoryItem?.nameMultiLang ?? {});
                if (badgeLanguages.some(language => !languages.includes(language))) {
                    message.error('分类多语言存在缺失，请检查');
                    return;
                }
            }

            if (openReward === 1) {
                if (isHomeLand) {
                    if (!rewardGoods.length) {
                        message.error('请至少选择一个奖品');
                        return;
                    }
                } else {
                    const missingIndex = rawMultiLang.findIndex(item => !item.rewardGoods?.length);
                    if (missingIndex !== -1) {
                        setActiveKey(rawMultiLang[missingIndex].language);
                        message.error('请补全当前语言的奖品内容');
                        return;
                    }
                }
            }

            const nameMultiLang = badgeLanguages.reduce((result, language, index) => {
                result[language] = {
                    name: badgeNameOptionsDict[multiLang[language].nameId!]?.label,
                    nameId: multiLang[language].nameId!,
                    sort: index,
                };
                return result;
            }, {} as NameMultiLangType);

            const descriptionMultiLang = badgeLanguages.reduce((result, language, index) => {
                result[language] = {
                    name: multiLang[language].description ?? '',
                    sort: index,
                };
                return result;
            }, {} as NameMultiLangType);

            const params: any = {
                boardId: currentBoardId,
                iconUrl: toRelativeImagePath(iconUrl),
                nameId,
                name: badgeNameOptionsDict[nameId!]?.label,
                description: isHomeLand
                    ? multiLang[DEFAULT_HOME_LANG].description
                    : multiLang[DEFAULT_INTL_LANGS[0]].description,
                nameMultiLang,
                descriptionMultiLang,
                hasOpenReward: openReward,
                ...rest,
            };

            if (openReward === 1) {
                if (isHomeLand) {
                    params.goods = buildSubmitRewardGoods(rewardGoods);
                } else {
                    params.goodsMultiLang = rawMultiLang.reduce((result, item, index) => {
                        result[item.language] = {
                            sort: index,
                            goods: buildSubmitRewardGoods(item.rewardGoods || []),
                        };
                        return result;
                    }, {} as Record<string, { sort: number; goods: BadgeRewardItem[] }>);
                }
            } else if (isHomeLand) {
                params.goods = savedRewardSnapshot.goods;
            } else {
                params.goodsMultiLang = savedRewardSnapshot.goodsMultiLang;
            }

            const { code, msg } = await (isCreate
                ? createBadge(query, params, clubDeployVersion)
                : updateBadge(query, { id: data!.id, ...params }, clubDeployVersion));
            if (code === 0) {
                message.success(`${isCreate ? '新建' : '编辑'}成功`);
                onOk(isCreate || data.status !== AuditStatus.Pass);
            } else {
                message.error(msg);
            }
        } catch (formError) {
            const { errorFields } = formError as any;
            if (errorFields) {
                const errorItem = errorFields.find((item: any) => (item?.name || []).includes('multiLang'));
                const key = get(errorItem, 'name[1]', '');
                const values = modalForm.getFieldValue('multiLang') || [];
                if (isNumber(key)) {
                    setActiveKey(values[key]?.language || defaultActiveLang);
                }
                setTimeout(() => {
                    modalForm.scrollToField(errorFields[0].name);
                }, 20);
                if (!isHomeLand) {
                    message.error('表单校验失败，请检查');
                }
            }
        } finally {
            setLoading(false);
            submitRef.current = false;
        }
    }, [
        badgeNameOptionsDict,
        buildSubmitRewardGoods,
        categoryListDict,
        clubDeployVersion,
        data,
        defaultActiveLang,
        isCreate,
        isHomeLand,
        modalForm,
        onOk,
        savedRewardSnapshot,
        toRelativeImagePath,
    ]);

    const conditionDisabled = useMemo(() => !isCreate && data?.status === AuditStatus.Pass, [ data?.status, isCreate ]);

    return (
        <Drawer
            width={900}
            title={`${isCreate ? '新增' : '编辑'}徽章`}
            visible={visible}
            onClose={() => {
                onClose();
                setHasOpenReward(0);
                setSavedRewardSnapshot({
                    goods: [],
                    goodsMultiLang: {},
                });
                modalForm.resetFields();
            }}
            footer={[
                <Button
                    style={{ float: 'right', marginRight: 16 }}
                    key="submit"
                    type="primary"
                    loading={loading}
                    disabled={initLoading}
                    onClick={handleSubmit}
                >
                    提交
                </Button>,
            ]}
        >
            <Spin spinning={initLoading}>
                <Form<BadgeFormValues>
                    form={modalForm}
                    labelCol={{ span: 4 }}
                    onValuesChange={handleValuesChange}
                    initialValues={{
                        multiLang: getInitialMultiLang(isHomeLand),
                        conditionType: BadgeConditionTypeEnum.ContinuousLogin,
                        hasOpenReward: 0,
                        rewardGoods: [],
                    }}
                >
                    <Form.List name="multiLang">
                        {(fields, { add, remove }) => (
                            <Tabs
                                activeKey={activeKey}
                                onTabClick={setActiveKey}
                                {...(isHomeLand
                                    ? { type: 'card' }
                                    : { type: 'editable-card', addIcon: <div>+添加语种</div> })}
                                onEdit={(key, action: 'add' | 'remove') => {
                                    const formMultiLang = (modalForm.getFieldValue('multiLang') ||
                                        []) as BadgeFormMultiLang[];
                                    if (action === 'add') {
                                        const ref = React.createRef<{ form: FormInstance }>();
                                        const options = languageOptions.map(item => ({
                                            ...item,
                                            disabled: formMultiLang.some(value => value.language === item.value),
                                        }));

                                        Modal.confirm({
                                            icon: null,
                                            title: '添加语种',
                                            content: <LangSelectModal options={options} ref={ref} />,
                                            async onOk() {
                                                const { language = [] } =
                                                    (await ref.current?.form.validateFields()) ?? {};
                                                const sourceRewardGoods =
                                                    ((modalForm.getFieldValue('multiLang') || [])[0] as
                                                        | BadgeFormMultiLang
                                                        | undefined)?.rewardGoods || [];

                                                setSelectedLanguages(prev => [ ...prev, ...language ]);
                                                language.forEach((languageItem: string) => {
                                                    add({
                                                        language: languageItem,
                                                        rewardGoods: translateRewardGoods(
                                                            sourceRewardGoods,
                                                            languageItem
                                                        ),
                                                    });
                                                });
                                            },
                                        });
                                        return;
                                    }

                                    const lang = String(key);
                                    const removeIndex = formMultiLang.findIndex(item => item.language === lang);
                                    if (removeIndex === -1) {
                                        return;
                                    }

                                    remove(removeIndex);
                                    setSelectedLanguages(prev => prev.filter(item => item !== lang));

                                    const nextMultiLang = ((modalForm.getFieldValue('multiLang') ||
                                        []) as BadgeFormMultiLang[]).filter(item => item.language !== lang);
                                    if (activeKey === lang) {
                                        setActiveKey(
                                            nextMultiLang[Math.max(removeIndex - 1, 0)]?.language || defaultActiveLang
                                        );
                                    }
                                }}
                            >
                                {fields.map(field => {
                                    const currentLanguage =
                                        modalForm.getFieldValue([ 'multiLang', field.name, 'language' ]) ||
                                        selectedLanguages[field.name];

                                    return (
                                        <Tabs.TabPane
                                            forceRender
                                            closable={![ 0, 1 ].includes(field.name)}
                                            tab={langMap[currentLanguage]}
                                            key={currentLanguage}
                                        >
                                            <Form.Item label="所属版块" wrapperCol={{ span: 10 }} required>
                                                <Tag
                                                    color="cyan"
                                                    style={{
                                                        borderRadius: 8,
                                                        fontSize: 14,
                                                        padding: '4px 9px',
                                                    }}
                                                >
                                                    {data?.boardName}
                                                </Tag>
                                            </Form.Item>
                                            <Form.Item
                                                name={[ field.name, 'nameId' ]}
                                                label="徽章名称"
                                                required
                                                rules={[
                                                    {
                                                        async validator(_, value) {
                                                            if (!value) {
                                                                return Promise.reject('徽章名称不能为空');
                                                            }
                                                            const categoryId = modalForm.getFieldValue('categoryId');
                                                            const level = modalForm.getFieldValue('level');
                                                            const lang = modalForm.getFieldValue([
                                                                'multiLang',
                                                                field.name,
                                                                'language',
                                                            ]);
                                                            if (categoryId && level) {
                                                                const params = {
                                                                    categoryId,
                                                                    nameId: value,
                                                                    boardId,
                                                                    level,
                                                                    lang,
                                                                    ...(isCreate ? {} : { id: data?.id }),
                                                                };
                                                                const { code, data: sort, msg } = await verifyBadge(
                                                                    params,
                                                                    clubDeployVersion
                                                                );
                                                                if (code !== 0) {
                                                                    return Promise.reject(msg || '校验失败');
                                                                }
                                                                if (!submitRef.current) {
                                                                    modalForm.setFields([
                                                                        { name: 'sort', value: sort },
                                                                    ]);
                                                                }
                                                            }
                                                            return Promise.resolve();
                                                        },
                                                    },
                                                ]}
                                            >
                                                <Select
                                                    className="input-width"
                                                    placeholder="请输入徽章名称"
                                                    showSearch
                                                    optionFilterProp="children"
                                                    optionLabelProp="label"
                                                    filterOption={(input, option: any) =>
                                                        option.label.toLowerCase().indexOf(input.toLowerCase()) >= 0
                                                    }
                                                    dropdownRender={menu => (
                                                        <div>
                                                            <EditLineContext.Provider value={groupEditLineContextValue}>
                                                                {menu}
                                                                <Divider style={{ margin: '4px 0' }} />
                                                                <div
                                                                    style={{
                                                                        display: 'flex',
                                                                        flexWrap: 'nowrap',
                                                                        padding: 8,
                                                                    }}
                                                                >
                                                                    <Input
                                                                        allowClear
                                                                        maxLength={MAX_BADGE_NAME_LENGTH}
                                                                        style={{ flex: 'auto' }}
                                                                        value={badgeNameValue}
                                                                        onChange={event =>
                                                                            setBadgeNameValue(event.target.value.trim())
                                                                        }
                                                                    />
                                                                    <div
                                                                        style={{
                                                                            flex: 'none',
                                                                            padding: '8px',
                                                                            display: 'block',
                                                                            cursor: 'pointer',
                                                                        }}
                                                                        onClick={() =>
                                                                            onAddValue(currentLanguage, badgeNameValue)
                                                                        }
                                                                    >
                                                                        <PlusOutlined /> 添加
                                                                    </div>
                                                                </div>
                                                            </EditLineContext.Provider>
                                                        </div>
                                                    )}
                                                >
                                                    {badgeNameOptions.map(item => {
                                                        if (item.lang !== currentLanguage) {
                                                            return null;
                                                        }
                                                        return (
                                                            <Select.Option
                                                                key={item.value}
                                                                value={item.value}
                                                                label={item.label}
                                                            >
                                                                <EditLine
                                                                    btnVisible={{
                                                                        edit: false,
                                                                        remove: true,
                                                                        copy: false,
                                                                    }}
                                                                    value={item.label}
                                                                    onDelete={() => handleRemoveBadgeName(item.value)}
                                                                    key={item.value}
                                                                    inputProps={{ maxLength: 50 }}
                                                                />
                                                            </Select.Option>
                                                        );
                                                    })}
                                                </Select>
                                            </Form.Item>
                                            <Form.Item
                                                label="描述"
                                                name={[ field.name, 'description' ]}
                                                required
                                                rules={[
                                                    { required: true, message: '徽章描述不能为空' },
                                                    inputEmojiRule,
                                                ]}
                                            >
                                                <Input
                                                    className="q1-form-item-xl"
                                                    placeholder="请输入徽章描述"
                                                    maxLength={50}
                                                />
                                            </Form.Item>
                                        </Tabs.TabPane>
                                    );
                                })}
                            </Tabs>
                        )}
                    </Form.List>
                    <Form.Item label="级别" name="level" required rules={[ { required: true, message: '级别不能为空' } ]}>
                        <Select
                            onChange={async () => {
                                const multiLang = modalForm.getFieldValue('multiLang') || [];
                                const fieldsToValidate = multiLang.map((_: any, index: number) => [
                                    'multiLang',
                                    index,
                                    'nameId',
                                ]);
                                await modalForm.validateFields(fieldsToValidate);
                            }}
                            className="q1-form-item-xl"
                            options={BadgeLevelOptions}
                        />
                    </Form.Item>
                    <Form.Item
                        name="iconUrl"
                        label="图标"
                        extra="尺寸建议64*64，png/jpg格式，内存2M以内"
                        required
                        rules={[ { message: '徽章图标不能为空', required: true } ]}
                    >
                        <UploadImg
                            imageOrigin=""
                            uploadOption={ClubUploadOption}
                            maxSize={2 * 1024 * 1024}
                            accept="image/png,image/jpg,image/jpeg"
                            isRandomFileName={true}
                        />
                    </Form.Item>
                    <Form.Item
                        label="分类"
                        required
                        name="categoryId"
                        rules={[ { message: '分类不能为空', required: true } ]}
                    >
                        <Select
                            onChange={async () => {
                                const multiLang = modalForm.getFieldValue('multiLang') || [];
                                const fieldsToValidate = multiLang.map((_: any, index: number) => [
                                    'multiLang',
                                    index,
                                    'nameId',
                                ]);
                                await modalForm.validateFields(fieldsToValidate);
                            }}
                            className="q1-form-item-xl"
                            options={categoryOptions}
                            placeholder="请选择徽章分类"
                        />
                    </Form.Item>
                    <Form.Item label="获得条件" required>
                        <Space>
                            <Form.Item
                                name="conditionType"
                                noStyle
                                rules={[ { required: true, message: '条件不能为空' } ]}
                            >
                                <Select
                                    disabled={conditionDisabled}
                                    options={BadgeConditionTypeOptions}
                                    className="q1-form-item"
                                />
                            </Form.Item>
                            <Form.Item
                                name="conditionValue"
                                noStyle
                                rules={[ { required: true, message: '达成要求不能为空' } ]}
                            >
                                <InputNumber disabled={conditionDisabled} min={1} max={9999999} />
                            </Form.Item>
                            <Form.Item shouldUpdate={(prev, next) => prev.conditionType !== next.conditionType} noStyle>
                                {({ getFieldValue }) => {
                                    const conditionType = getFieldValue('conditionType') as BadgeConditionTypeEnum;
                                    return <span>{BadgeConditionTypeSuffixMap[conditionType]}</span>;
                                }}
                            </Form.Item>
                        </Space>
                    </Form.Item>
                    <Form.Item label="排序" required name="sort" rules={[ { required: true, message: '排序不能为空' } ]}>
                        <InputNumber min={1} max={99} />
                    </Form.Item>
                    <Form.Item label="奖品选择" name="hasOpenReward">
                        <NumberSwitch checkedChildren="开启" unCheckedChildren="关闭" />
                    </Form.Item>
                    {hasOpenReward === 1 && (
                        <Form.Item label={<></>} colon={false} wrapperCol={{ span: 20 }}>
                            <Form.Item shouldUpdate noStyle>
                                {() => {
                                    const multiLangValues = (modalForm.getFieldValue('multiLang') ||
                                        []) as BadgeFormMultiLang[];
                                    const activeIndex = multiLangValues.findIndex(item => item?.language === activeKey);
                                    const rewardPath = isHomeLand
                                        ? ([ 'rewardGoods' ] as (string | number)[])
                                        : ([ 'multiLang', activeIndex >= 0 ? activeIndex : 0, 'rewardGoods' ] as (
                                              | string
                                              | number
                                          )[]);
                                    const currentLang = isHomeLand
                                        ? DEFAULT_HOME_LANG
                                        : multiLangValues[activeIndex >= 0 ? activeIndex : 0]?.language ||
                                          defaultActiveLang;

                                    return (
                                        <Form.Item name={rewardPath} noStyle key={currentLang}>
                                            <BadgeRewardSelector
                                                goodsOptions={getRewardGoodsOptions(currentLang)}
                                                goodsOptionsLoading={rewardSourceLoading}
                                                goodsImageOptions={goodsImageOptions}
                                                dressUpData={dressUpData}
                                                lang={currentLang}
                                                resolveImageUrl={toAbsoluteClubImage}
                                            />
                                        </Form.Item>
                                    );
                                }}
                            </Form.Item>
                        </Form.Item>
                    )}
                </Form>
            </Spin>
        </Drawer>
    );
}

interface LangSelectModalProps {
    options: Array<OptionType>;
}

const LangSelectModal = React.forwardRef((props: LangSelectModalProps, ref) => {
    const { options } = props;
    const [ form ] = Form.useForm();

    React.useImperativeHandle(ref, () => ({
        form,
    }));

    return (
        <Form form={form}>
            <Form.Item required rules={[ { required: true, message: '请选择' } ]} label="语种" name="language">
                <Select options={options} placeholder="请选择语种" mode="multiple" />
            </Form.Item>
        </Form>
    );
});
