import { inject, observer, useObserver } from 'mobx-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Button,
    Card,
    Checkbox,
    DatePicker,
    Form,
    Input,
    InputNumber,
    message,
    Modal,
    Radio,
    Select,
    Space,
    Spin,
    Tabs,
    Tag,
    Tooltip,
} from 'antd';
import { cloneDeep, debounce, get, isEqual, isNumber, keyBy, map, omit, uniqBy, uniqueId } from 'lodash';
import moment from 'moment';
import { OptionsType } from 'rc-select/lib/interface';

import placeholderImage from '@/assets/placeholder_image.png';
import placeholderVideo from '@/assets/placeholder_video.png';
import { StoreType } from '@/store/config';
import { useContentDialogContainer, useContentParams, useContentTab, useContentTabSearch, useStore } from '@/context';
import {
    getLotteryDetail,
    createLottery,
    getLotteryPostList,
    getLotteryUserList,
    editLottery,
    getBoardGameVersion,
    getAllDressUp,
} from '@/api/club';
import NumberSwitch from '@/components/NumberSwitch';
import { isEmpty } from '@/utils/helper';
import { getGameConfigCenterCompatible } from '@/api/configCenter';
import useUserSelect from '@/pages/club/board/hooks/useUserSelect';

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
import {
    CLUB_DEPLOY_VERSION,
    CLUB_ENVIRONMENT_ENUM,
    CONDITIONENUM,
    FLOOR_RULE_ENUM,
    KEYWORD_ENABLE_ENUM,
    KEYWORD_MODE_ENUM,
    KeywordModeOptions,
    LotteryConditonConstant,
    LotteryCreateParams,
    LotteryEditParams,
    LotteryPostResponse,
    LotteryProvideItem,
    LotteryRewardsType,
    LotteryUserResponse,
    PRIZEENUM,
    PrizeFieldConstant,
    PrizeFieldType,
    PrizeFieldValuesType,
    RICH_TEXT_TYPE_ENUM,
    VOTE_MODE_ENUM,
    VoteItem,
} from '@ts/club';

import ActivityPrize from './list/components/ActivityPrize';
import { TABLE_TYPE } from './list';
import { getFixedPrizeGoodsName } from './utils/fixedPrizeI18n';
import './create.less';
interface LotteryCreateProps {}
interface MobxLotteryCreateProps
    extends LotteryCreateProps,
        Pick<StoreType, 'UIState' | 'Permit' | 'Game' | 'GameContext' | 'User' | 'GoodsInfo'> {}

const MAX_NAME = 20;
const DEFAULT_LANG = 'en-US';
const DEFAULT_LANG_CN = 'zh-CN';
const INIT_LANGS = [ DEFAULT_LANG, DEFAULT_LANG_CN ];
const options = [
    { label: LotteryConditonConstant[CONDITIONENUM.Attention], value: CONDITIONENUM.Attention },
    { label: LotteryConditonConstant[CONDITIONENUM.Discuss], value: CONDITIONENUM.Discuss },
    { label: LotteryConditonConstant[CONDITIONENUM.Upvote], value: CONDITIONENUM.Upvote },
    { label: LotteryConditonConstant[CONDITIONENUM.Collect], value: CONDITIONENUM.Collect },
    { label: LotteryConditonConstant[CONDITIONENUM.Vote], value: CONDITIONENUM.Vote },
];

const getExpiredTextByLang = (expiredDay: number | undefined, language: string) => {
    const normalized = String(language || '')
        .trim()
        .toLowerCase();

    if (!expiredDay) {
        if (normalized === 'ko-kr') {
            return '영구';
        }

        if (normalized === 'en-us') {
            return 'Permanent';
        }

        return '永久';
    }

    switch (normalized) {
        case 'zh-tw':
        case 'zh-hk':
        case 'ja-jp':
            return `${expiredDay}日`;
        case 'ko-kr':
            return `${expiredDay}일`;
        case 'en-us':
            return `${expiredDay} days`;
        case 'zh-cn':
        default:
            return `${expiredDay}天`;
    }
};

interface MultiUserProps {
    disabled?: boolean;
    list: LotteryUserResponse[];
    value?: number[];
    multiuser: LotteryUserResponse[];
    setMultiuser: (opt: LotteryUserResponse[]) => void;
    getOptions: (s: 'follow', v: string, multiuser?: LotteryUserResponse[]) => void;
    onChange?: (v: number[]) => void;
}
//   关注作者
const MultiUserComponent = function (props: MultiUserProps) {
    const { disabled = false, multiuser, setMultiuser, value = [], list = [], getOptions, onChange } = props;
    const options: LotteryUserResponse[] = useMemo(() => {
        return list.filter(x => value?.includes(x.userId));
    }, [ list, value ]);
    const selectChange = useCallback(
        function MultiUserComponent(v, opt: any) {
            const data = opt.filter((x: { value: number }) => x?.value);
            setMultiuser(
                uniqBy(
                    multiuser.concat(
                        data.map((x: { children: string; value: number }) => ({
                            nickName: x?.children?.replace(/（\d+）$/, ''),
                            userId: x?.value,
                        }))
                    ),
                    'userId'
                ) as LotteryUserResponse[]
            );
            onChange && onChange(v);
        },
        [ multiuser, onChange, setMultiuser ]
    );
    const onDeselect = useCallback(
        v => {
            setMultiuser(multiuser.filter(x => x.userId !== v));
        },
        [ multiuser, setMultiuser ]
    );
    const close = useCallback(
        (e, v: LotteryUserResponse) => {
            e.preventDefault();
            const filterVal = value.filter(x => x !== v.userId);
            onDeselect(v.userId);
            onChange && onChange(filterVal);
        },
        [ onChange, onDeselect, value ]
    );
    // 失去焦点时还原
    const userBlur = useCallback(() => {
        setTimeout(() => {
            getOptions('follow', '', multiuser);
        }, 500);
    }, [ getOptions, multiuser ]);

    return (
        <>
            <Select
                disabled={disabled}
                showSearch
                onBlur={userBlur}
                onSearch={debounce(v => {
                    getOptions('follow', v);
                }, 300)}
                value={value || []}
                mode="multiple"
                style={{ width: '335px' }}
                onChange={selectChange}
                onDeselect={onDeselect}
            >
                {list.map(x => {
                    return (
                        <Select.Option key={x.userId} value={x.userId}>
                            {`${x.nickName}（${x.userId}）`}
                        </Select.Option>
                    );
                })}
            </Select>
            <div>
                {(options || [])?.map(x => (
                    <Tag
                        key={x.userId}
                        closable={!disabled}
                        onClose={e => close(e, x)}
                        style={{ marginTop: '15px', padding: '4px 10px' }}
                    >
                        {x.nickName}
                    </Tag>
                ))}
            </div>
        </>
    );
};
interface KeywordProps {
    disabled?: boolean;
    value?: Array<number | string>;
    onChange?: (v: Array<number | string>) => void;
    type?: 'keyword' | 'floor';
    count?: number;
}

//   匹配关键词
const KeywordComponent = function (props: KeywordProps) {
    const { disabled = false, value = [], onChange, type = 'keyword', count } = props;
    const [ val, setVal ] = useState<string | number | null>(() => (type === 'keyword' ? '' : null));
    const close = useCallback(
        function KeywordComponent(e, v) {
            e.preventDefault();
            const filterVal = value?.filter(x => x !== v);
            onChange && onChange(filterVal);
        },
        [ onChange, value ]
    );
    const add = useCallback(() => {
        if (!val) {
            return;
        }
        if (type === 'keyword') {
            if (value?.length === 10) {
                return message.warning('最多可添加10个');
            }
        }
        if (value?.includes(val!)) {
            return message.warning('已存在该' + (type === 'keyword' ? '关键词' : '楼层'));
        }
        onChange && onChange((value || []).concat(val!));
        setVal(type === 'keyword' ? '' : null);
    }, [ onChange, type, val, value ]);
    const addButtonDisabled = useMemo(() => {
        return type === 'keyword' ? disabled : value.length > count! - 1;
    }, [ count, disabled, type, value.length ]);
    return useMemo(
        () => (
            <div>
                <Space>
                    {type === 'keyword' ? (
                        <Input
                            allowClear
                            disabled={disabled}
                            value={val!}
                            onChange={e => setVal(e.target.value.trim())}
                            maxLength={15}
                        />
                    ) : (
                        <InputNumber
                            disabled={disabled}
                            precision={0}
                            min={1}
                            value={val as any}
                            onChange={v => setVal(v!)}
                        />
                    )}
                    <Button disabled={addButtonDisabled} type="primary" onClick={add}>
                        添加
                    </Button>
                </Space>
                <div>
                    {value?.map(x => (
                        <Tag
                            key={x}
                            closable={!disabled}
                            onClose={e => close(e, x)}
                            style={{ marginTop: '15px', padding: '4px 10px' }}
                        >
                            {x}
                        </Tag>
                    ))}
                </div>
            </div>
        ),
        [ add, addButtonDisabled, close, disabled, type, val, value ]
    );
};
const LotteryCreate = function (props: LotteryCreateProps) {
    const {
        UIState,
        GoodsInfo: { getGoodsInfo },
    } = props as MobxLotteryCreateProps;
    const getContainer = useContentDialogContainer();
    const { id } = useContentParams();
    const tab = useContentTab();
    const query = useContentTabSearch();
    const type = query.get('type') || 'create';
    const boardId = Number(query.get('boardId') || 1);
    const clubDeployVersion = (query.get('clubDeployVersion') || 'zh') as CLUB_DEPLOY_VERSION;
    const isMultipleLanguage = clubDeployVersion === CLUB_ENVIRONMENT_ENUM.EN;
    let isEdit = type === 'edit';
    const isCopy = type === 'copy';
    const isCreate = type === 'create';

    const [ form ] = Form.useForm();
    const { Club } = useStore();
    const languageOptions = useMemo(() => Club.languageOptions || [], [ Club.languageOptions ]);
    const languageDict = useMemo(() => keyBy(languageOptions, 'value'), [ languageOptions ]);

    const [ languageForm ] = Form.useForm();
    const [ selectedLanguages, setSelectedLanguages ] = useState<string[]>([ ...INIT_LANGS ]);
    const [ multilingualKey, setMultilingualKey ] = useState<string>(DEFAULT_LANG);
    const [ languageModalVisible, setLanguageModalVisible ] = useState(false);
    const syncRef = useRef(false);
    const prevMultiLangRef = useRef<any[]>([]);
    const appearanceReqIdRef = useRef(0);
    const buildHdjplx = useCallback(
        (v: {
            prop?: Attachment[];
            entity?: Attachment[];
            empiricalValue?: Attachment[];
            memberPointValue?: Attachment[];
            appearanceValue?: Attachment[];
        }) => {
            const { prop = [], entity = [], empiricalValue = [], memberPointValue = [], appearanceValue = [] } = v;
            return (prop.map(x => ({ ...x, type: PrizeFieldConstant[PRIZEENUM.Prop] })) as (Attachment & {
                type: PrizeFieldValuesType;
            })[])
                .concat(
                    entity.map(x => ({ ...x, type: PrizeFieldConstant[PRIZEENUM.Entity] })),
                    empiricalValue.map(x => ({ ...x, type: PrizeFieldConstant[PRIZEENUM.EmpiricalValue] })),
                    memberPointValue.map(x => ({ ...x, type: PrizeFieldConstant[PRIZEENUM.MemberPoint] })),
                    appearanceValue.map(x => ({ ...x, type: PrizeFieldConstant[PRIZEENUM.Dressup] }))
                )
                .map((x: Attachment) => ({ ...x, id: uniqueId('hdjplx_') }));
        },
        []
    );

    const [ multiLanguageGoodsInfo, setMultiLanguageGoodsInfo ] = useState<any[]>([]);
    const multiLanguageGoodsDict = useMemo(() => keyBy(multiLanguageGoodsInfo, item => String(item.GoodsId)), [
        multiLanguageGoodsInfo,
    ]);
    const [ boardGameVersion, setBoardGameVersion ] = useState<{ gameId: number; gameVersion: string } | null>(null);
    const [ dressUpData, setDressUpData ] = useState<any[]>([]);
    const dressUpDict = useMemo(() => keyBy(dressUpData, item => String(item.id)), [ dressUpData ]);
    const languageListOptions = useMemo(() => {
        return languageOptions.map(item => ({
            label: item.label,
            value: item.value,
            disabled: selectedLanguages.includes(item.value),
        }));
    }, [ languageOptions, selectedLanguages ]);

    const getDressupDisplayName = useCallback(
        (goodsId: any, language: string, fallback?: string) => {
            const item = get(dressUpDict, [ String(goodsId) ]);
            if (!item) {
                return fallback;
            }
            const infos = (item.dressUpInfos || []) as Array<{ dressName?: string; language?: string }>;
            const normalizedLang = String(language || '')
                .trim()
                .toLowerCase();
            const findName = (lang: string) =>
                infos.find(
                    i =>
                        String(i.language || '')
                            .trim()
                            .toLowerCase() === String(lang).trim().toLowerCase()
                )?.dressName;

            const candidates: string[] = [];
            if (normalizedLang) {
                candidates.push(normalizedLang);
                if (normalizedLang.startsWith('zh-') && normalizedLang !== 'zh-cn') {
                    candidates.push('zh-cn');
                }
            }
            candidates.push('en-us', 'zh-cn');

            const nameBase = candidates.map(findName).find(Boolean) || fallback || '名称错误';
            return `${nameBase}-${getExpiredTextByLang(item.expiredDay, language)}（${item.id}）`;
        },
        [ dressUpDict ]
    );

    // 关联作者
    const [ selectedAuthor, setSelectedAuthor ] = useState<LotteryUserResponse>();

    const [ userListLoading, setUserListLoading ] = useState(false);

    // 关联作者创作
    const [ postList, setPostList ] = useState<LotteryPostResponse[]>([]);
    // 关注作者
    const [ followConditionList, setFollowConditionList ] = useState<LotteryUserResponse[]>([]);
    const [ multiuser, setMultiuser ] = useState<LotteryUserResponse[]>([]);

    const [ detail, setDetail ] = useState({} as LotteryProvideItem);
    const [ initlValues, setInitlValues ] = useState<any>({
        name: '',
        userId: undefined,
        postId: undefined,
        lotteryRewards: [],
        count: undefined,
        rewardTime: undefined,
        remark: '',
        condition: [],
        isAssociatedAuthor: '0',
        followCondition: [],
        isKeyword: KEYWORD_MODE_ENUM.Exact,
        keyWord: [],
        keyWordShow: KEYWORD_ENABLE_ENUM.Open,
        voteMode: VOTE_MODE_ENUM.None,
        voteOption: [],
        floorRule: FLOOR_RULE_ENUM.Random,
        prop: [],
        entity: [],
        empiricalValue: [],
        memberPointValue: [],
        appearanceValue: [],
        commentFloor: undefined,
        hdjplx: [
            // {
            //     goodsId: 0,
            //     goodsName: 'ssss',
            //     goodsNum: 122,
            //     type: PrizeFieldConstant[PRIZEENUM.Entity]
            // },
            // {
            //     goodsId: 0,
            //     goodsName: '经验值',
            //     goodsNum: 22,
            //     type: PrizeFieldConstant[PRIZEENUM.EmpiricalValue]
            // }
        ],
        ...(isMultipleLanguage
            ? {
                  multiLang: INIT_LANGS.map((lang, idx) => ({
                      language: lang,
                      sort: idx,
                      name: '',
                      remark: '',
                      prop: [],
                      entity: [],
                      empiricalValue: [],
                      memberPointValue: [],
                      appearanceValue: [],
                      hdjplx: [],
                  })),
              }
            : {}),
    });
    const [ loading, setLoading ] = useState(false);

    const getGoodsNameFields = useCallback((lang: string) => {
        const normalized = String(lang || '')
            .trim()
            .toLowerCase();
        // 语言表 code 带中杠（如 zh-TW）；道具多语言表字段不带中杠（如 zhHKGoodsName）
        // 一般只用：英/简/繁/韩/日；其余语言按英文回退
        switch (normalized) {
            case 'zh-cn':
                return [ 'zhCNGoodsName', 'enUSGoodsName' ];
            case 'zh-tw':
            case 'zh-hk':
                // 语言表用 zh-TW；道具配置表常用 zhHKGoodsName（也兼容历史 zhTWGoodsName）
                // TW 若缺失，优先回退到简体，再回退到英文
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
        (goodsId: any, lang: string, fallback?: string) => {
            const keys = getGoodsNameFields(lang);
            for (const key of keys) {
                const val = get(multiLanguageGoodsDict, [ String(goodsId), key ]);
                if (val) {
                    return val;
                }
            }
            return fallback;
        },
        [ getGoodsNameFields, multiLanguageGoodsDict ]
    );

    const getMultiLangGoodsOptions = useCallback(
        (lang: string) => {
            const nameKeys = getGoodsNameFields(lang);
            return (multiLanguageGoodsInfo || []).map((item: any) => ({
                id: item.GoodsId,
                name: (nameKeys.map(k => get(item, k)).find(Boolean) ||
                    item.GoodsName ||
                    item.name ||
                    String(item.GoodsId)) as string,
            }));
        },
        [ getGoodsNameFields, multiLanguageGoodsInfo ]
    );

    const [ goodsInfoLoading, setGoodsInfoLoading ] = useState(false);
    const [ goodsInfo, setGoodsInfo ] = useState<any[]>([]);

    const refreshAppearanceData = useCallback(async () => {
        setGoodsInfoLoading(true);
        try {
            const reqId = ++appearanceReqIdRef.current;
            const [ versionRes, dressRes ] = await Promise.all([
                getBoardGameVersion({ id: boardId }, clubDeployVersion).catch(() => null),
                getAllDressUp(boardId, clubDeployVersion).catch(() => ({ data: [] } as any)),
            ]);
            if (reqId !== appearanceReqIdRef.current) {
                return;
            }
            if (versionRes?.code === 0 && versionRes?.data?.length) {
                const gameId = versionRes.data[0].gameId;
                const gameVersion = versionRes.data[0].gameVersion;
                setBoardGameVersion({ gameId, gameVersion });
                if (!isMultipleLanguage) {
                    const ret = await getGameConfigCenterCompatible({
                        tableName: 'GoodsInfo',
                        gameId: versionRes.data[0].gameId,
                        gameVersion: versionRes.data[0].gameVersion,
                    });
                    const data = ret.data || [];
                    const transformData = data?.map(x => {
                        let isCombitkey = gameId in GOODID_KEY_COMBINATION;
                        let isDefaultKey = gameId in GOODID_KEY_DICT;
                        return {
                            ...x,
                            id: isCombitkey
                                ? GOODID_KEY_COMBINATION[(gameId as unknown) as GoodIdKeyCombitDictType]
                                      .map(k => x?.[k])
                                      .join(GOODID_VALUE_SEPARATE)
                                : x?.[ // 物品Id
                                      isDefaultKey
                                          ? GOODID_KEY_DICT[(gameId as unknown) as GoodIdKeyDictType]
                                          : GOODID_KEY_DICT['default']
                                  ],
                            name:
                                x?.[ // 物品名称
                                    gameId in GOODNAME_KEY_DICT
                                        ? GOODNAME_KEY_DICT[(gameId as unknown) as GoodNameKeyDictType]
                                        : GOODNAME_KEY_DICT['default']
                                ],
                            max:
                                x?.[ // 单个物品
                                    gameId in GOODS_KEY_MAX_DICT
                                        ? GOODS_KEY_MAX_DICT[(gameId as unknown) as GoodsKeyMaxDictType]
                                        : GOODS_KEY_MAX_DICT['default']
                                ] ?? GOODS_MAX_DEFAULT,
                        };
                    });
                    setGoodsInfo(transformData);
                } else {
                    setBoardGameVersion(null);
                }
                setDressUpData(dressRes?.data || []);
            }
        } finally {
            setGoodsInfoLoading(false);
        }
    }, [ boardId, clubDeployVersion, isMultipleLanguage ]);

    useEffect(() => {
        if (!boardId) {
            setBoardGameVersion(null);
            setDressUpData([]);
            return;
        }
        refreshAppearanceData();
    }, [ boardId, isMultipleLanguage, refreshAppearanceData ]);

    useEffect(() => {
        if (!isMultipleLanguage || !dressUpData.length) {
            return;
        }
        const multiLangValues = form.getFieldValue('multiLang');
        if (!Array.isArray(multiLangValues) || !selectedLanguages.length) {
            return;
        }
        if (syncRef.current) {
            return;
        }
        syncRef.current = true;
        try {
            const fields: any[] = [];
            for (let i = 0; i < selectedLanguages.length; i++) {
                const lang = selectedLanguages[i];
                const item = multiLangValues[i] || {};
                const appearanceValue = (Array.isArray(item.appearanceValue) ? item.appearanceValue : []).map(
                    (x: any) => ({
                        ...x,
                        goodsName: getDressupDisplayName(x.goodsId, lang, x.goodsName),
                    })
                );
                fields.push({ name: [ 'multiLang', i, 'appearanceValue' ], value: appearanceValue });
                fields.push({
                    name: [ 'multiLang', i, 'hdjplx' ],
                    value: buildHdjplx({ ...item, appearanceValue }),
                });
            }
            if (fields.length) {
                form.setFields(fields);
            }
        } finally {
            syncRef.current = false;
        }
    }, [ buildHdjplx, dressUpData, form, getDressupDisplayName, isMultipleLanguage, selectedLanguages ]);

    useEffect(() => {
        if (!isMultipleLanguage || !boardGameVersion) {
            return;
        }
        (async () => {
            try {
                const { data } = await getGameConfigCenterCompatible({
                    gameId: boardGameVersion.gameId,
                    gameVersion: boardGameVersion.gameVersion,
                    dataVersion: '1',
                    tableName: 'MutiLanguageGoodsInfo',
                });
                if (data) {
                    const _data = data.map((item: any) => ({
                        ...item,
                        ...(item?.zhTWGoodsName && !item?.zhHKGoodsName
                            ? {
                                  zhHKGoodsName: item.zhTWGoodsName,
                              }
                            : {}),
                    }));
                    setMultiLanguageGoodsInfo(_data);
                }
            } catch (e) {}
        })();
    }, [ boardGameVersion, isMultipleLanguage ]);

    const multilingualChange = useCallback((key: string) => {
        setMultilingualKey(key);
    }, []);

    const multilingualEdit = useCallback(
        (key: any, action: 'add' | 'remove') => {
            if (action === 'add') {
                setLanguageModalVisible(true);
                return;
            }
            const lang = String(key);
            if (INIT_LANGS.includes(lang)) {
                return;
            }
            const idx = selectedLanguages.findIndex(item => item === lang);
            if (idx === -1) {
                return;
            }
            const nextSelected = selectedLanguages.slice();
            nextSelected.splice(idx, 1);
            const multiLangValues = (form.getFieldValue('multiLang') || []).slice();
            multiLangValues.splice(idx, 1);

            // 经验值 / 会员积分 / 个性装扮：统一选择（id/num 等），但 goodsName 按语言显示
            if (multiLangValues.length) {
                const source = multiLangValues[0] || {};
                const sourceEmpiricalValue = Array.isArray(source.empiricalValue) ? source.empiricalValue : [];
                const sourceMemberPointValue = Array.isArray(source.memberPointValue) ? source.memberPointValue : [];
                const sourceAppearanceValue = Array.isArray(source.appearanceValue) ? source.appearanceValue : [];
                for (let i = 0; i < multiLangValues.length; i++) {
                    const langKey = nextSelected[i] || DEFAULT_LANG;
                    multiLangValues[i] = {
                        ...(multiLangValues[i] || {}),
                        sort: i,
                        empiricalValue: sourceEmpiricalValue.map((x: any) => ({
                            ...x,
                            goodsName: getFixedPrizeGoodsName('empiricalValue', langKey),
                        })),
                        memberPointValue: sourceMemberPointValue.map((x: any) => ({
                            ...x,
                            goodsName: getFixedPrizeGoodsName('memberPointValue', langKey),
                        })),
                        appearanceValue: sourceAppearanceValue.map((x: any) => ({
                            ...x,
                            goodsName: getDressupDisplayName(x.goodsId, langKey, x.goodsName),
                        })),
                    };
                    multiLangValues[i].hdjplx = buildHdjplx(multiLangValues[i]);
                }
            }
            form.setFields([
                {
                    name: 'multiLang',
                    value: multiLangValues,
                },
            ]);
            setSelectedLanguages(nextSelected);
            if (lang === multilingualKey) {
                setMultilingualKey(nextSelected[Math.max(idx - 1, 0)] || DEFAULT_LANG);
            }
        },
        [ buildHdjplx, form, getDressupDisplayName, multilingualKey, selectedLanguages ]
    );

    const onResetLanguageForm = useCallback(() => {
        setLanguageModalVisible(false);
        languageForm.resetFields();
    }, [ languageForm ]);

    const onAddLanguage = useCallback(async () => {
        const { languages } = await languageForm.validateFields();
        const languageList: string[] = languages || [];
        if (!languageList.length) {
            return;
        }
        const base0 = form.getFieldValue([ 'multiLang', 0 ]) || {};
        const currentProp = base0.prop || [];
        const baseEmpiricalValue = Array.isArray(base0.empiricalValue) ? base0.empiricalValue : [];
        const baseMemberPointValue = Array.isArray(base0.memberPointValue) ? base0.memberPointValue : [];
        const baseAppearanceValue = Array.isArray(base0.appearanceValue) ? base0.appearanceValue : [];
        const baseSetting = (form.getFieldValue('multiLang') || []).slice();
        const newItems = languageList.map((lang, idx) => {
            const prop = currentProp.map((item: any) => ({
                ...item,
                goodsName: getTranslatedGoodsName(item.goodsId, lang, item.goodsName),
            }));
            const empiricalValue = baseEmpiricalValue.map((x: any) => ({
                ...x,
                goodsName: getFixedPrizeGoodsName('empiricalValue', lang),
            }));
            const memberPointValue = baseMemberPointValue.map((x: any) => ({
                ...x,
                goodsName: getFixedPrizeGoodsName('memberPointValue', lang),
            }));
            const appearanceValue = baseAppearanceValue.map((x: any) => ({
                ...x,
                goodsName: getDressupDisplayName(x.goodsId, lang, x.goodsName),
            }));
            const hdjplx = buildHdjplx({ prop, empiricalValue, memberPointValue, appearanceValue });
            return {
                language: lang,
                sort: baseSetting.length + idx,
                name: '',
                remark: '',
                prop,
                entity: [],
                empiricalValue,
                memberPointValue,
                appearanceValue,
                hdjplx,
            };
        });
        const nextMultiLang = baseSetting.concat(newItems).map((item: any, i: number) => ({
            ...(item || {}),
            sort: i,
        }));
        form.setFields([
            {
                name: 'multiLang',
                value: nextMultiLang,
            },
        ]);
        setSelectedLanguages([ ...selectedLanguages, ...languageList ]);
        setMultilingualKey(languageList[languageList.length - 1]);
        onResetLanguageForm();
    }, [
        buildHdjplx,
        form,
        getDressupDisplayName,
        getTranslatedGoodsName,
        languageForm,
        onResetLanguageForm,
        selectedLanguages,
    ]);

    const buildLotteryRewardsFromHdjplx = useCallback(
        (hdjplx: Array<Attachment & { type: PrizeFieldValuesType }> = []) => {
            return (hdjplx || []).map(x => ({
                rewardEnum: PrizeFieldType[x.type],
                name: x.goodsName,
                id:
                    x.type === PrizeFieldConstant[PRIZEENUM.Prop] || x.type === PrizeFieldConstant[PRIZEENUM.Dressup]
                        ? x.goodsId
                        : 0,
                number: x.goodsNum,
                childType: x.childType,
            }));
        },
        []
    );

    const submit = useCallback(
        async values => {
            const {
                rewardTime,
                condition,
                hdjplx,
                multiLang,
                isAssociatedAuthor = 0,
                voteMode,
                voteOption,
                floorRule,
                commentFloor,
                postId,
                ...rest
            } = values;

            const postItem = postList.find(x => x.id === postId);
            let _voteOptions = voteMode === VOTE_MODE_ENUM.None ? [] : voteOption;
            if (voteMode === VOTE_MODE_ENUM.Fixed) {
                _voteOptions = (postItem?.votes || [])
                    .filter(item => _voteOptions.includes(item.id))
                    .map((item: VoteItem) => ({
                        id: item.id,
                        name: item.content,
                    }));
            }

            const defaultLangIndex = selectedLanguages.findIndex(lang => lang === DEFAULT_LANG);
            const defaultSetting = isMultipleLanguage ? (multiLang || [])[Math.max(defaultLangIndex, 0)] : null;
            const defaultName = isMultipleLanguage ? defaultSetting?.name : rest.name;
            const defaultRemark = isMultipleLanguage ? defaultSetting?.remark : rest.remark;
            const defaultHdjplx = isMultipleLanguage ? defaultSetting?.hdjplx || [] : hdjplx;
            const multiLangPayload = isMultipleLanguage
                ? selectedLanguages.reduce((acc, lang, idx) => {
                      const setting = (multiLang || [])[idx] || {};
                      acc[lang] = {
                          sort: idx,
                          name: setting.name || '',
                          remark: setting.remark || '',
                          lotteryRewards: buildLotteryRewardsFromHdjplx(setting.hdjplx || []),
                      };
                      return acc;
                  }, {} as any)
                : undefined;

            const params = {
                boardId,
                ...omit(rest, 'multiLang'),
                name: defaultName,
                remark: defaultRemark,
                postId,
                condition,
                rewardTime: moment(rewardTime).startOf('day'),
                isAssociatedAuthor: condition.includes(CONDITIONENUM.Attention) ? Number(isAssociatedAuthor || 0) : 0,
                ...(voteMode === VOTE_MODE_ENUM.None ? {} : { voteOption: _voteOptions }),
                ...(floorRule === FLOOR_RULE_ENUM.Random ? {} : { commentFloor }),
                ...(isMultipleLanguage ? { multiLang: multiLangPayload } : {}),
                lotteryRewards: buildLotteryRewardsFromHdjplx(defaultHdjplx),
            };
            const operation = isEdit ? '编辑' : isCopy ? '复制' : '创建';
            Modal.confirm({
                getContainer,
                title: '系统提示',
                content: (
                    <div>
                        <p className="recycleBin__delete__text">
                            <span>确定要{operation}活动</span>【<span>{params.name}</span>】<span>并提交审核吗</span>？
                        </p>
                    </div>
                ),
                onOk: async () => {
                    const req = omit(
                        params,
                        PrizeFieldConstant[PRIZEENUM.Prop],
                        PrizeFieldConstant[PRIZEENUM.Entity],
                        PrizeFieldConstant[PRIZEENUM.EmpiricalValue],
                        PrizeFieldConstant[PRIZEENUM.MemberPoint],
                        'hdjplx'
                    );
                    const { id, status } = detail;
                    const res = await (isEdit
                        ? editLottery({ ...req, id, status } as LotteryEditParams, boardId, clubDeployVersion)
                        : createLottery(req as LotteryCreateParams, boardId, clubDeployVersion));
                    if (res.code === 0) {
                        message.success(`${operation}成功`);
                        UIState.gotoTab({
                            pathname: `/game/club/lottery/list`,
                            ...(isCreate
                                ? {
                                      state: {
                                          activeRouteKey: TABLE_TYPE.Audit,
                                      },
                                  }
                                : null),
                        });
                        UIState.closeTab(tab);
                    } else {
                        message.error(res.msg || '异常错误');
                    }
                },
                onCancel: () => {},
            });
        },
        [
            UIState,
            boardId,
            buildLotteryRewardsFromHdjplx,
            clubDeployVersion,
            detail,
            getContainer,
            isCopy,
            isCreate,
            isEdit,
            isMultipleLanguage,
            postList,
            selectedLanguages,
            tab,
        ]
    );

    const onFinishFailed = useCallback(
        ({ errorFields }) => {
            if (!isMultipleLanguage || !errorFields?.length) {
                return;
            }
            const errorItem = errorFields.find((item: any) => (item?.name || []).includes('multiLang'));
            const idx = get(errorItem, 'name[1]', '');
            if (isNumber(idx)) {
                setMultilingualKey(selectedLanguages[idx] || DEFAULT_LANG);
            }
        },
        [ isMultipleLanguage, selectedLanguages ]
    );

    const onValuesChange = useCallback(
        // eslint-disable-next-line complexity
        (changedValues, allValues) => {
            console.log('changeValues', changedValues);
            // 多语言：游戏道具(prop)联动 + 每个语言奖品汇总(hdjplx)
            if (isMultipleLanguage && 'multiLang' in (changedValues || {})) {
                if (syncRef.current) {
                    return;
                }
                syncRef.current = true;
                try {
                    const all = (allValues as any).multiLang || [];
                    const prev = prevMultiLangRef.current || [];
                    const getList = (item: any, key: string) => (Array.isArray(item?.[key]) ? item[key] : []);
                    const findChangedIndex = (key: string) =>
                        all.findIndex(
                            (item: any, index: number) => !isEqual(getList(prev[index], key), getList(item, key))
                        );
                    const propChangeIndex = findChangedIndex('prop');
                    const fixedLangKeys = [ 'empiricalValue', 'memberPointValue' ] as const;
                    const nonMultiKeys = [ 'appearanceValue' ] as const;
                    const fields: any[] = [];
                    const cloneList = (list: any[]) => (Array.isArray(list) ? list.map(x => ({ ...x })) : []);

                    const fixedKeyChangeIndexMap = {
                        empiricalValue: findChangedIndex('empiricalValue'),
                        memberPointValue: findChangedIndex('memberPointValue'),
                    };
                    const appearanceChangeIndex = findChangedIndex('appearanceValue');

                    if (
                        propChangeIndex < 0 &&
                        fixedKeyChangeIndexMap.empiricalValue < 0 &&
                        fixedKeyChangeIndexMap.memberPointValue < 0 &&
                        appearanceChangeIndex < 0
                    ) {
                        prevMultiLangRef.current = cloneDeep(all);
                        return;
                    }

                    // 道具联动：统一 goodsId/goodsNum，按语言替换 goodsName
                    if (propChangeIndex >= 0) {
                        const sourceLang = selectedLanguages[propChangeIndex];
                        const sourceProp = (all[propChangeIndex]?.prop || []).map((item: any) => ({
                            ...item,
                            goodsName: getTranslatedGoodsName(item.goodsId, sourceLang, item.goodsName),
                        }));
                        for (let i = 0; i < selectedLanguages.length; i++) {
                            const lang = selectedLanguages[i];
                            const translatedProp = sourceProp.map((item: any) => ({
                                ...item,
                                goodsName: getTranslatedGoodsName(item.goodsId, lang, item.goodsName),
                            }));
                            fields.push({ name: [ 'multiLang', i, 'prop' ], value: translatedProp });
                            all[i] = { ...(all[i] || {}), prop: translatedProp };
                        }
                    }

                    // 经验值 / 会员积分：需要按语言同步 goodsName（不区分多语言的仅是 id/num 等结构）
                    for (const key of fixedLangKeys) {
                        const keyChangeIndex = fixedKeyChangeIndexMap[key];
                        if (keyChangeIndex < 0) {
                            continue;
                        }
                        for (let i = 0; i < selectedLanguages.length; i++) {
                            const lang = selectedLanguages[i];
                            const sourceList = cloneList(all[keyChangeIndex]?.[key] || []);
                            const v = sourceList.map((x: any) => ({
                                ...x,
                                goodsName: getFixedPrizeGoodsName(key, lang),
                            }));
                            fields.push({ name: [ 'multiLang', i, key ], value: v });
                            all[i] = { ...(all[i] || {}), [key]: v };
                        }
                    }

                    // 个性装扮：统一选择（id/num 等），但 goodsName 按语言显示
                    for (const key of nonMultiKeys) {
                        const keyChangeIndex = appearanceChangeIndex;
                        if (keyChangeIndex < 0) {
                            continue;
                        }
                        for (let i = 0; i < selectedLanguages.length; i++) {
                            const lang = selectedLanguages[i];
                            const sourceList = cloneList(all[keyChangeIndex]?.[key] || []);
                            const v =
                                key === 'appearanceValue'
                                    ? sourceList.map((x: any) => ({
                                          ...x,
                                          goodsName: getDressupDisplayName(x.goodsId, lang, x.goodsName),
                                      }))
                                    : cloneList(sourceList);
                            fields.push({ name: [ 'multiLang', i, key ], value: v });
                            all[i] = { ...(all[i] || {}), [key]: v };
                        }
                    }

                    for (let i = 0; i < selectedLanguages.length; i++) {
                        const item = all[i] || {};
                        fields.push({ name: [ 'multiLang', i, 'hdjplx' ], value: buildHdjplx(item) });
                    }

                    if (fields.length) {
                        form.setFields(fields);
                        // 重新触发校验，避免联动后遗留的“请添加活动奖品”提示
                        const validateNames = selectedLanguages.map((_, i) => [ 'multiLang', i, 'hdjplx' ]);
                        Promise.resolve()
                            .then(() => form.validateFields(validateNames))
                            .catch(() => {});
                    }
                    prevMultiLangRef.current = cloneDeep(all);
                } finally {
                    syncRef.current = false;
                }
                return;
            }

            // 单语言：活动奖品
            if (
                [
                    PrizeFieldConstant[PRIZEENUM.Prop],
                    PrizeFieldConstant[PRIZEENUM.Entity],
                    PrizeFieldConstant[PRIZEENUM.EmpiricalValue],
                    PrizeFieldConstant[PRIZEENUM.MemberPoint],
                    PrizeFieldConstant[PRIZEENUM.Dressup],
                ].includes(Object.keys(changedValues)[0] as PrizeFieldValuesType)
            ) {
                const {
                    prop = [],
                    entity = [],
                    empiricalValue = [],
                    memberPointValue = [],
                    appearanceValue = [],
                } = allValues;
                form.setFieldsValue({
                    hdjplx: buildHdjplx({ prop, entity, empiricalValue, memberPointValue, appearanceValue }),
                });
            }
        },
        [ buildHdjplx, form, getDressupDisplayName, getTranslatedGoodsName, isMultipleLanguage, selectedLanguages ]
    );

    const getUserList = useCallback(
        async (type: 'follow', val?, list?: LotteryUserResponse[]) => {
            setUserListLoading(true);
            try {
                const { code, data = [] } = await getLotteryUserList(
                    {
                        userId: val ? (isNaN(Number(val)) ? undefined : Number(val)) : undefined,
                        boardId,
                        pageIndex: 1,
                        pageSize: 100,
                    },
                    clubDeployVersion
                );
                if (code === 0) {
                    let result = uniqBy((list || []).concat(data || []), item => item.userId);
                    type === 'follow' && setFollowConditionList(result);
                }
            } catch (error) {
            } finally {
                setUserListLoading(false);
            }
        },
        [ boardId, clubDeployVersion ]
    );

    const initialAuthorOptions = useMemo(() => {
        return selectedAuthor
            ? [
                  {
                      value: selectedAuthor.userId,
                      label: `${selectedAuthor.nickName}（${selectedAuthor.userId}）`,
                      nickName: selectedAuthor.nickName,
                  },
              ]
            : [];
    }, [ selectedAuthor ]);

    const { selectNode: userSelectNode, historyUserOptionsDict } = useUserSelect({
        boardId,
        clubDeployVersion,
        pageSize: 10,
        initialOptions: initialAuthorOptions,
        selectProps: {
            disabled: isEdit,
            style: { width: '335px' },
            placeholder: '请输入大玩家ID或昵称',
            notFoundContent: null,
        },
    });

    const [ postListLoading, setPostListLoading ] = useState(false);

    const getPostList = useCallback(
        async (v: number) => {
            setPostListLoading(true);
            try {
                const { code, data = [] } = await getLotteryPostList({ boardId, userId: v }, clubDeployVersion);
                if (code === 0) {
                    setPostList(data);
                }
            } finally {
                setPostListLoading(false);
            }
        },
        [ boardId, clubDeployVersion ]
    );
    const selectUserChange = useCallback(
        (v: number) => {
            const current = historyUserOptionsDict[v] || (selectedAuthor?.userId === v ? selectedAuthor : undefined);
            if (current) {
                setSelectedAuthor({
                    userId: 'value' in current ? Number(current.value) : current.userId,
                    nickName:
                        ('nickName' in current ? current.nickName : undefined) ||
                        String(('label' in current ? current.label : current.nickName) || '').replace(/（\d+）$/, ''),
                });
            }
            getPostList(v);
        },
        [ getPostList, historyUserOptionsDict, selectedAuthor ]
    );
    const goodsFn = useCallback((lotteryRewards: LotteryRewardsType[], type: PRIZEENUM) => {
        return lotteryRewards
            .filter(x => x.rewardEnum === type)
            .map(x => ({
                goodsId: [ PRIZEENUM.EmpiricalValue, PRIZEENUM.MemberPoint, PRIZEENUM.Entity ].includes(type)
                    ? Number(uniqueId())
                    : x.id,
                goodsName: x.name,
                goodsNum: x.number,
                type: PrizeFieldConstant[x.rewardEnum],
                childType: x.childType,
            }));
    }, []);
    const getDetail = useCallback(async () => {
        setLoading(true);
        try {
            const { code, data, msg } = await getLotteryDetail({ id, boardId }, clubDeployVersion!);
            if (code === 0 && data) {
                getUserList('follow', undefined, data.followConditionList);
                setMultiuser(data.followConditionList); // 记录选中的关注作者数据
                setSelectedAuthor({ nickName: data.nickName, userId: data.userId! });
                setDetail(data);
                const {
                    userId,
                    postId,
                    lotteryRewards = [],
                    rewardTime = '',
                    isAssociatedAuthor = 0,
                    voteOption,
                    commentFloor,
                } = data;
                const values = {
                    ...data,
                    postId: isCopy ? undefined : postId, // 复制时关联作者创作不填充且禁用之前已经使用的选项，否则复制失败
                    isAssociatedAuthor: String(isAssociatedAuthor),
                    rewardTime: rewardTime && !isCopy ? moment(rewardTime) : undefined,
                    prop: goodsFn(lotteryRewards, PRIZEENUM.Prop),
                    entity: goodsFn(lotteryRewards, PRIZEENUM.Entity),
                    empiricalValue: goodsFn(lotteryRewards, PRIZEENUM.EmpiricalValue),
                    memberPointValue: goodsFn(lotteryRewards, PRIZEENUM.MemberPoint),
                    appearanceValue: goodsFn(lotteryRewards, PRIZEENUM.Dressup),
                    hdjplx: [],
                    voteMode: voteOption && voteOption.length > 0 ? VOTE_MODE_ENUM.Fixed : VOTE_MODE_ENUM.None,
                    voteOption: isEdit ? map(voteOption, item => item.id) : [],
                    floorRule: !isEmpty(commentFloor) ? FLOOR_RULE_ENUM.Assign : FLOOR_RULE_ENUM.Random,
                };

                if (isMultipleLanguage) {
                    const buildHdjplx = (v: {
                        prop?: Attachment[];
                        entity?: Attachment[];
                        empiricalValue?: Attachment[];
                        memberPointValue?: Attachment[];
                        appearanceValue?: Attachment[];
                    }) => {
                        const {
                            prop = [],
                            entity = [],
                            empiricalValue = [],
                            memberPointValue = [],
                            appearanceValue = [],
                        } = v;
                        return (prop.map(x => ({ ...x, type: PrizeFieldConstant[PRIZEENUM.Prop] })) as (Attachment & {
                            type: PrizeFieldValuesType;
                        })[])
                            .concat(
                                entity.map(x => ({ ...x, type: PrizeFieldConstant[PRIZEENUM.Entity] })),
                                empiricalValue.map(x => ({ ...x, type: PrizeFieldConstant[PRIZEENUM.EmpiricalValue] })),
                                memberPointValue.map(x => ({ ...x, type: PrizeFieldConstant[PRIZEENUM.MemberPoint] })),
                                appearanceValue.map(x => ({ ...x, type: PrizeFieldConstant[PRIZEENUM.Dressup] }))
                            )
                            .map((x: Attachment) => ({ ...x, id: uniqueId('hdjplx_') }));
                    };

                    const multiLang = (data as any).multiLang || {};
                    const languages = Object.keys(multiLang);
                    const hasSort = languages.some(l => isNumber(multiLang?.[l]?.sort));
                    const langs = hasSort
                        ? languages
                              .map(lang => ({ lang, sort: multiLang?.[lang]?.sort }))
                              .sort((a: any, b: any) => {
                                  const sa = isNumber(a.sort) ? a.sort : Number.MAX_SAFE_INTEGER;
                                  const sb = isNumber(b.sort) ? b.sort : Number.MAX_SAFE_INTEGER;
                                  return sa - sb;
                              })
                              .map(x => x.lang)
                        : (() => {
                              const ordered = [
                                  ...[ DEFAULT_LANG, DEFAULT_LANG_CN ].filter(l => languages.includes(l)),
                                  ...languages.filter(l => ![ DEFAULT_LANG, DEFAULT_LANG_CN ].includes(l)),
                              ];
                              return ordered.length ? ordered : [ ...INIT_LANGS ];
                          })();
                    setSelectedLanguages(langs);
                    setMultilingualKey(langs.includes(DEFAULT_LANG) ? DEFAULT_LANG : langs[0]);

                    const multiLangValues = langs.map((lang, idx) => {
                        const item = multiLang[lang] || {};
                        const rewards = item.lotteryRewards || (lang === DEFAULT_LANG ? lotteryRewards : []);
                        const prop = goodsFn(rewards, PRIZEENUM.Prop).map((p: any) => ({
                            ...p,
                            goodsName: getTranslatedGoodsName(p.goodsId, lang, p.goodsName),
                        }));
                        const entity = goodsFn(rewards, PRIZEENUM.Entity);
                        const empiricalValue = goodsFn(rewards, PRIZEENUM.EmpiricalValue);
                        const memberPointValue = goodsFn(rewards, PRIZEENUM.MemberPoint);
                        const appearanceValue = goodsFn(rewards, PRIZEENUM.Dressup).map((x: any) => ({
                            ...x,
                            goodsName: getDressupDisplayName(x.goodsId, lang, x.goodsName),
                        }));
                        const hdjplx = buildHdjplx({ prop, entity, empiricalValue, memberPointValue, appearanceValue });
                        return {
                            language: lang,
                            sort: isNumber(item.sort) ? item.sort : idx,
                            name: item.name || (lang === DEFAULT_LANG ? data.name : ''),
                            remark: item.remark || (lang === DEFAULT_LANG ? data.remark : ''),
                            prop,
                            entity,
                            empiricalValue,
                            memberPointValue,
                            appearanceValue,
                            hdjplx,
                        };
                    });

                    values.multiLang = multiLangValues as any;
                    const defaultIdx = langs.findIndex(l => l === DEFAULT_LANG);
                    const def = multiLangValues[Math.max(defaultIdx, 0)] || {};
                    values.name = def.name;
                    values.remark = def.remark;
                    values.hdjplx = (def.hdjplx || []) as any;
                }
                setInitlValues(values);
                form.setFieldsValue(values);
                userId && selectUserChange(userId);
                if (!isMultipleLanguage) {
                    onValuesChange({ prop: values.prop }, values);
                }
            } else {
                message.error(msg);
            }
        } catch (error) {
        } finally {
            setLoading(false);
        }
    }, [
        boardId,
        clubDeployVersion,
        form,
        getDressupDisplayName,
        getTranslatedGoodsName,
        getUserList,
        goodsFn,
        id,
        isCopy,
        isEdit,
        isMultipleLanguage,
        onValuesChange,
        selectUserChange,
    ]);

    useEffect(() => {
        if (isCreate) {
            getUserList('follow');
        }
        (isCopy || isEdit) && getDetail();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ isCopy, isCreate, isEdit ]);
    // 解析动态内容
    const analysisContent = useCallback((type, data) => {
        let node = null;
        switch (type) {
            case RICH_TEXT_TYPE_ENUM.Text:
            case RICH_TEXT_TYPE_ENUM.Link:
                node = data;
                break;
            case RICH_TEXT_TYPE_ENUM.Image:
                node = <img src={placeholderImage} width={24} alt={data} />;
                break;
            case RICH_TEXT_TYPE_ENUM.Video:
                node = <img src={placeholderVideo} width={24} alt="" />;
                break;
            case RICH_TEXT_TYPE_ENUM.Emoji:
                node = <img src={data} width={24} className="emoji" alt="" />;
                break;
        }
        return node;
    }, []);

    return (
        <Spin spinning={loading} className="lottery-create-page">
            <Form
                scrollToFirstError={true}
                initialValues={initlValues}
                onFinish={submit}
                onFinishFailed={onFinishFailed}
                onReset={() => form.resetFields()}
                form={form}
                labelCol={{ span: 3 }}
                onValuesChange={onValuesChange}
                // wrapperCol={{ span: 10 }}
            >
                <Card
                    title={<span className="sub-title">活动信息</span>}
                    extra={
                        <>
                            <span className="text-danger">*</span>
                            <span className="sub-title">为必填项</span>
                        </>
                    }
                    bordered={false}
                    style={{ marginBottom: '12px' }}
                >
                    {isMultipleLanguage ? (
                        <>
                            <Tabs
                                activeKey={multilingualKey}
                                onTabClick={multilingualChange}
                                type="editable-card"
                                addIcon={<div>+添加语种</div>}
                                onEdit={multilingualEdit}
                            >
                                {selectedLanguages.map(lang => (
                                    <Tabs.TabPane
                                        key={lang}
                                        tab={languageDict[lang]?.label || lang}
                                        closable={!INIT_LANGS.includes(lang)}
                                        forceRender
                                    />
                                ))}
                            </Tabs>
                            {selectedLanguages.map((lang, idx) => (
                                <Form.Item
                                    key={lang}
                                    hidden={multilingualKey !== lang}
                                    name={[ 'multiLang', idx, 'name' ]}
                                    label="活动名称"
                                    rules={[
                                        {
                                            required: true,
                                            message: '活动名称不能为空，请输入！',
                                            transform: v => v?.trim(),
                                        },
                                        {
                                            max: MAX_NAME,
                                            message: `活动名称字数不能超出${MAX_NAME}个字符，请修改！`,
                                            transform: v => v?.trim(),
                                        },
                                    ]}
                                >
                                    <Input allowClear style={{ width: '350px' }} placeholder="请输入活动名称" />
                                </Form.Item>
                            ))}
                        </>
                    ) : null}
                    {!isMultipleLanguage && (
                        <Form.Item
                            name="name"
                            label="活动名称"
                            rules={[
                                {
                                    required: true,
                                    message: '活动名称不能为空，请输入！',
                                    transform: v => v?.trim(),
                                },
                                {
                                    max: MAX_NAME,
                                    message: `红包名称字数不能超出${MAX_NAME}个汉字，请修改！`,
                                    transform: v => v?.trim(),
                                },
                            ]}
                        >
                            <Input allowClear style={{ width: '350px' }} placeholder="请输入活动名称" />
                        </Form.Item>
                    )}
                    <Form.Item
                        name="userId"
                        label="关联作者"
                        rules={[
                            {
                                required: true,
                                message: '请选择关联作者',
                            },
                        ]}
                    >
                        {React.cloneElement(userSelectNode, {
                            onChange: (v: number) => {
                                form.setFields([
                                    { name: 'postId', value: undefined },
                                    { name: 'voteMode', value: VOTE_MODE_ENUM.None },
                                ]);
                                selectUserChange(v);
                            },
                        })}
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(pre, cur) => pre.userId !== cur.userId}>
                        {({ getFieldValue }) => {
                            const userId = getFieldValue('userId');
                            return userId ? (
                                <Form.Item
                                    name="postId"
                                    label="关联作者创作"
                                    rules={[
                                        {
                                            required: true,
                                            message: '请选择关联作者创作',
                                        },
                                    ]}
                                >
                                    <Select
                                        disabled={isEdit}
                                        style={{ width: '335px' }}
                                        showSearch
                                        placeholder="请选择"
                                        loading={postListLoading}
                                        onChange={postId => {
                                            const o = postList.find(v => v.id === postId);
                                            const content = JSON.parse(o?.content ?? '[]');
                                            const emptyVote = content.every(
                                                (v: { Type: RICH_TEXT_TYPE_ENUM }) =>
                                                    v.Type !== RICH_TEXT_TYPE_ENUM.Vote
                                            );
                                            const disabled = !postId || emptyVote;
                                            if (disabled) {
                                                form.setFields([ { name: 'voteMode', value: VOTE_MODE_ENUM.None } ]);
                                            } else {
                                                form.setFields([
                                                    {
                                                        name: 'voteOption',
                                                        value: [],
                                                    },
                                                ]);
                                            }
                                        }}
                                    >
                                        {postList?.map(x => {
                                            let label = `${x.title}（${x.id}）`;
                                            if (x.type === 0) {
                                                label = `${x.title}（${x.id}）`;
                                            } else {
                                                const content = JSON.parse(x.content || '[]');
                                                label = content?.map(
                                                    (v: { Type: RICH_TEXT_TYPE_ENUM; Data: string }, i: number) => {
                                                        return (
                                                            <span key={i}>
                                                                {analysisContent(v.Type, v.Data)}
                                                                {i === content.length - 1 ? `（${x.id}）` : ''}
                                                            </span>
                                                        );
                                                    }
                                                );
                                            }
                                            return (
                                                <Select.Option key={x.id} value={x.id} disabled={!!x.lotteryId}>
                                                    <Tooltip title={label}>
                                                        <span className="lottery-create-title-ellipsis">{label}</span>
                                                    </Tooltip>
                                                </Select.Option>
                                            );
                                        })}
                                    </Select>
                                </Form.Item>
                            ) : null;
                        }}
                    </Form.Item>

                    {isMultipleLanguage
                        ? selectedLanguages.map((lang, idx) => (
                              <Form.Item
                                  key={lang}
                                  hidden={multilingualKey !== lang}
                                  name={[ 'multiLang', idx, 'hdjplx' ]}
                                  label="活动奖品"
                                  required
                                  rules={[
                                      {
                                          validator: (rule: any, value: string[]) => {
                                              if (!value || value?.length === 0) {
                                                  return Promise.reject('请添加活动奖品');
                                              }
                                              return Promise.resolve();
                                          },
                                      },
                                  ]}
                              >
                                  <ActivityPrize
                                      form={form}
                                      isEdit={isEdit}
                                      lang={lang}
                                      fieldPrefix={[ 'multiLang', idx ]}
                                      propGoodsOptions={getMultiLangGoodsOptions(lang)}
                                      propGoodsOptionsLoading={isMultipleLanguage && !multiLanguageGoodsInfo.length}
                                      dressUpData={dressUpData}
                                  />
                              </Form.Item>
                          ))
                        : null}
                    {!isMultipleLanguage && (
                        <Form.Item
                            name="hdjplx"
                            label="活动奖品"
                            required
                            rules={[
                                {
                                    validator: (rule: any, value: string[]) => {
                                        if (!value || value?.length === 0) {
                                            return Promise.reject('请添加活动奖品');
                                        }
                                        return Promise.resolve();
                                    },
                                },
                            ]}
                        >
                            <ActivityPrize
                                form={form}
                                lang={DEFAULT_LANG_CN}
                                propGoodsOptions={goodsInfo}
                                propGoodsOptionsLoading={goodsInfoLoading}
                                dressUpData={dressUpData}
                            />
                        </Form.Item>
                    )}

                    <Form.Item label="开奖人数" required>
                        <Form.Item
                            noStyle
                            name="count"
                            rules={[
                                {
                                    required: true,
                                    message: '请输入开奖人数',
                                },
                            ]}
                        >
                            <InputNumber
                                min={1}
                                max={500}
                                precision={0}
                                onChange={() => {
                                    form.setFields([
                                        {
                                            name: 'commentFloor',
                                            value: [],
                                        },
                                    ]);
                                }}
                            />
                        </Form.Item>
                        &nbsp;人
                    </Form.Item>
                    <Form.Item label="活动截止时间" required>
                        <Form.Item
                            noStyle
                            name="rewardTime"
                            rules={[
                                {
                                    required: true,
                                    message: '请选择活动截止时间',
                                },
                            ]}
                        >
                            <DatePicker
                                disabledDate={current => current && current < moment().add(0, 'day').endOf('day')}
                            />
                        </Form.Item>
                        &nbsp; 00:00:00
                    </Form.Item>

                    {isMultipleLanguage
                        ? selectedLanguages.map((lang, idx) => (
                              <Form.Item
                                  key={lang}
                                  hidden={multilingualKey !== lang}
                                  name={[ 'multiLang', idx, 'remark' ]}
                                  label="活动说明"
                                  wrapperCol={{ span: 10 }}
                              >
                                  <Input.TextArea showCount maxLength={200} placeholder="请输入活动说明" />
                              </Form.Item>
                          ))
                        : null}
                    {!isMultipleLanguage && (
                        <Form.Item name="remark" label="活动说明" wrapperCol={{ span: 10 }}>
                            <Input.TextArea showCount maxLength={200} placeholder="请输入活动说明" />
                        </Form.Item>
                    )}
                </Card>
                <Card
                    title={<span className="sub-title">参与条件</span>}
                    extra={
                        <>
                            <span className="text-danger">*</span>
                            <span className="sub-title">为必填项</span>
                        </>
                    }
                    bordered={false}
                    style={{ marginBottom: '12px' }}
                >
                    <Form.Item
                        name="condition"
                        label="参与条件"
                        required
                        rules={[
                            {
                                required: true,
                                message: '请选择参与条件',
                            },
                        ]}
                    >
                        <Checkbox.Group disabled={isEdit} options={options} />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(pre, cur) => pre.condition !== cur.condition}>
                        {({ getFieldValue }) => {
                            const condition = getFieldValue('condition');
                            return (
                                <>
                                    {condition?.includes(CONDITIONENUM.Attention) ? (
                                        <Form.Item
                                            name="isAssociatedAuthor"
                                            label="关注"
                                            required
                                            rules={[
                                                {
                                                    required: true,
                                                    message: '请选择关注',
                                                },
                                            ]}
                                        >
                                            <Radio.Group disabled={isEdit}>
                                                <Radio.Button value="1">作者</Radio.Button>
                                                <Radio.Button value="0">多个用户</Radio.Button>
                                            </Radio.Group>
                                        </Form.Item>
                                    ) : null}
                                    <Form.Item
                                        shouldUpdate={(pre, cur) => pre.isAssociatedAuthor !== cur.isAssociatedAuthor}
                                        noStyle
                                    >
                                        {({ getFieldValue }) => {
                                            return (
                                                <>
                                                    {condition?.includes(CONDITIONENUM.Attention) &&
                                                    getFieldValue('isAssociatedAuthor') === '0' ? (
                                                        <Form.Item
                                                            name="followCondition"
                                                            label="关注作者"
                                                            required
                                                            rules={[
                                                                {
                                                                    validator: (rule: any, value: string[]) => {
                                                                        if (!value || value?.length === 0) {
                                                                            return Promise.reject('请选择关注作者');
                                                                        }
                                                                        return Promise.resolve();
                                                                    },
                                                                },
                                                            ]}
                                                        >
                                                            <MultiUserComponent
                                                                disabled={isEdit}
                                                                setMultiuser={setMultiuser}
                                                                getOptions={getUserList}
                                                                multiuser={multiuser}
                                                                list={followConditionList}
                                                            />
                                                        </Form.Item>
                                                    ) : null}
                                                </>
                                            );
                                        }}
                                    </Form.Item>
                                    {condition?.includes(CONDITIONENUM.Discuss) ? (
                                        <Form.Item label="匹配关键词" required>
                                            <div style={{ display: 'flex' }}>
                                                <Form.Item
                                                    name="isKeyword"
                                                    noStyle
                                                    rules={[
                                                        {
                                                            required: true,
                                                            message: '请选择',
                                                        },
                                                    ]}
                                                >
                                                    <Radio.Group
                                                        options={KeywordModeOptions}
                                                        optionType="button"
                                                        buttonStyle="solid"
                                                        disabled={isEdit}
                                                    />
                                                </Form.Item>
                                                <Form.Item
                                                    shouldUpdate={(prev, next) => prev.isKeyword !== next.isKeyword}
                                                    noStyle
                                                >
                                                    {({ getFieldValue }) => {
                                                        const isKeyword = getFieldValue('isKeyword');
                                                        if (isKeyword === KEYWORD_MODE_ENUM.Unlimt) {
                                                            return null;
                                                        } else {
                                                            return (
                                                                <Form.Item
                                                                    name="keyWordShow"
                                                                    label="关键词显示"
                                                                    style={{ marginLeft: 12 }}
                                                                    rules={[
                                                                        {
                                                                            required: true,
                                                                            message: '请选择',
                                                                        },
                                                                    ]}
                                                                >
                                                                    <NumberSwitch
                                                                        checkedChildren="开启"
                                                                        unCheckedChildren="关闭"
                                                                        disabled={isEdit}
                                                                    />
                                                                </Form.Item>
                                                            );
                                                        }
                                                    }}
                                                </Form.Item>
                                            </div>
                                            <Form.Item
                                                shouldUpdate={(prev, next) => prev.isKeyword !== next.isKeyword}
                                                noStyle
                                            >
                                                {({ getFieldValue }) => {
                                                    const isKeyword = getFieldValue('isKeyword');
                                                    if (isKeyword === KEYWORD_MODE_ENUM.Unlimt) {
                                                        return null;
                                                    } else {
                                                        return (
                                                            <Form.Item
                                                                name="keyWord"
                                                                noStyle
                                                                rules={[
                                                                    {
                                                                        validator: (rule: any, value: string[]) => {
                                                                            if (!value || value?.length === 0) {
                                                                                return Promise.reject(
                                                                                    '请添加匹配关键词'
                                                                                );
                                                                            }
                                                                            return Promise.resolve();
                                                                        },
                                                                    },
                                                                ]}
                                                            >
                                                                <KeywordComponent disabled={isEdit} />
                                                            </Form.Item>
                                                        );
                                                    }
                                                }}
                                            </Form.Item>
                                        </Form.Item>
                                    ) : null}
                                    {condition?.includes(CONDITIONENUM.Vote) ? (
                                        <Form.Item shouldUpdate={(pre, cur) => pre.postId !== cur.postId} noStyle>
                                            {({ getFieldValue }) => {
                                                const postId = getFieldValue('postId');
                                                const o = postList.find(v => v.id === postId);
                                                const content = JSON.parse(o?.content ?? '[]');
                                                const emptyVote = content.every(
                                                    (v: { Type: RICH_TEXT_TYPE_ENUM }) =>
                                                        v.Type !== RICH_TEXT_TYPE_ENUM.Vote
                                                );
                                                const disabled = !postId || emptyVote;
                                                // 这里的vote要后端加字段
                                                let options: OptionsType = [];
                                                options = (o?.votes ?? []).map((item: VoteItem) => ({
                                                    label: item.content,
                                                    value: item.id,
                                                }));
                                                return (
                                                    <>
                                                        <Form.Item label="投票选项" required name="voteMode">
                                                            <Radio.Group
                                                                optionType="button"
                                                                buttonStyle="solid"
                                                                disabled={isEdit}
                                                            >
                                                                <Radio.Button value={VOTE_MODE_ENUM.None}>
                                                                    无要求
                                                                </Radio.Button>
                                                                <Radio.Button
                                                                    value={VOTE_MODE_ENUM.Fixed}
                                                                    disabled={disabled}
                                                                >
                                                                    固定选项
                                                                </Radio.Button>
                                                            </Radio.Group>
                                                        </Form.Item>
                                                        <Form.Item
                                                            shouldUpdate={(pre, cur) =>
                                                                pre.voteMode !== cur.voteMode ||
                                                                pre.postId !== cur.postId
                                                            }
                                                            noStyle
                                                        >
                                                            {({ getFieldValue }) =>
                                                                getFieldValue('voteMode') === VOTE_MODE_ENUM.Fixed ? (
                                                                    <Form.Item
                                                                        name="voteOption"
                                                                        label="选项"
                                                                        required
                                                                        rules={[
                                                                            {
                                                                                required: true,
                                                                                message: '请选择',
                                                                            },
                                                                        ]}
                                                                    >
                                                                        <Select
                                                                            disabled={isEdit}
                                                                            mode="multiple"
                                                                            options={options}
                                                                            style={{ width: 300 }}
                                                                            loading={postListLoading}
                                                                        />
                                                                    </Form.Item>
                                                                ) : null
                                                            }
                                                        </Form.Item>
                                                    </>
                                                );
                                            }}
                                        </Form.Item>
                                    ) : (
                                        ''
                                    )}
                                </>
                            );
                        }}
                    </Form.Item>
                </Card>
                <Card
                    title={<span className="sub-title">限定条件</span>}
                    extra={
                        <>
                            <span className="text-danger">*</span>
                            <span className="sub-title">为必填项</span>
                        </>
                    }
                    bordered={false}
                    style={{ marginBottom: '12px' }}
                >
                    <Form.Item label="楼层抽奖规则" required>
                        <Form.Item noStyle name="floorRule">
                            <Radio.Group
                                optionType="button"
                                buttonStyle="solid"
                                style={{ marginBottom: 15 }}
                                disabled={isEdit}
                            >
                                <Radio.Button value={FLOOR_RULE_ENUM.Random}>随机</Radio.Button>
                                <Radio.Button value={FLOOR_RULE_ENUM.Assign}>指定楼层</Radio.Button>
                            </Radio.Group>
                        </Form.Item>
                        <Form.Item
                            shouldUpdate={(pre, cur) => pre.floorRule !== cur.floorRule || pre.count !== cur.count}
                        >
                            {({ getFieldValue }) => {
                                const count = getFieldValue('count');
                                const disabled = !count || isEdit;
                                return getFieldValue('floorRule') === FLOOR_RULE_ENUM.Assign ? (
                                    <Form.Item
                                        name="commentFloor"
                                        label="楼层"
                                        rules={[
                                            {
                                                required: true,
                                                message: '请添加楼层',
                                            },
                                        ]}
                                    >
                                        <KeywordComponent disabled={disabled} type="floor" count={count || 0} />
                                    </Form.Item>
                                ) : (
                                    ''
                                );
                            }}
                        </Form.Item>
                    </Form.Item>
                </Card>
                <Card
                    extra={
                        <>
                            <Button type="primary" htmlType="submit">
                                提交审核
                            </Button>
                        </>
                    }
                    bordered={false}
                    bodyStyle={{ display: 'none' }}
                    style={{ marginBottom: '12px' }}
                ></Card>
            </Form>
            <Modal
                title="添加语种"
                forceRender
                visible={languageModalVisible}
                onCancel={onResetLanguageForm}
                onOk={onAddLanguage}
                okButtonProps={{
                    disabled: selectedLanguages.length === languageOptions.length,
                }}
            >
                <Form form={languageForm}>
                    <Form.Item
                        label="语种"
                        name="languages"
                        required
                        rules={[ { required: true, message: '请选择语种' } ]}
                    >
                        <Select mode="multiple" options={languageListOptions} placeholder="请选择" />
                    </Form.Item>
                </Form>
            </Modal>
        </Spin>
    );
};

const LotteryCreateWithStore = inject(
    'UIState',
    'Permit',
    'GameContext',
    'User',
    'Club',
    'GoodsInfo'
)(observer(LotteryCreate));

export default function LotteryCreatePage() {
    const query = useContentTabSearch();
    const clubDeployVersion = (query.get('clubDeployVersion') || 'zh') as CLUB_DEPLOY_VERSION;
    const { Club, GoodsInfo } = useStore();

    const languageOptionsLoading = useObserver(() => Club.languageOptionsLoading);

    useEffect(() => {
        if (clubDeployVersion === CLUB_ENVIRONMENT_ENUM.EN && !Club.languageOptionsLoading) {
            Club.refreshLanguageOptions();
        }
    }, [ Club, GoodsInfo, clubDeployVersion ]);

    return clubDeployVersion === CLUB_ENVIRONMENT_ENUM.EN ? (
        <Spin spinning={languageOptionsLoading}>
            <LotteryCreateWithStore />
        </Spin>
    ) : (
        <LotteryCreateWithStore />
    );
}
