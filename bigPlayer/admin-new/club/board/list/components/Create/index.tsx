/* eslint-disable complexity */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, Drawer, Form, Input, message, Tabs } from 'antd';
import { inject, observer } from 'mobx-react';
import { clone, cloneDeep, differenceBy, groupBy, omit, uniq, get } from 'lodash';

import { StoreType } from '@/store/config';
import { addBoard, editBoard } from '@/api/club';
import { useContentDialogContainer } from '@/context';
import useSyncState from '@/hooks/state/useSyncState';
import { getPathName } from '@/utils/lib';

import {
    BoardDataType,
    BoardEditParams,
    BoardSectionType,
    ExtendConfig,
    RewardGoodsItem,
    PROMPT_TYPE,
    PromptValues,
    SECTION_MODE,
    SECTION_TYPE,
    CLUB_ENVIRONMENT_ENUM,
    CLUB_APP_ID,
    OPEN_MODE,
} from '@ts/club';

import BaseForm from '../BaseForm';
import SystemForm from '../SystemForm';
import ImageForm from '../ImageForm';
import RobotForm from '../RobotForm';
import AccountForm from '../AccountForm';
import { BoardCreateProvider, DefaultLanguage } from '../../../context/boardCreateProvider';

require('./index.less');

export const SEPARATE = '&&&&';

enum FORM_TAB_TYPE {
    Base = '1',
    System = '2',
    Image = '3',
    Robot = '4',
    BindAccount = '5',
}

/** sections 平铺 */
function sectionsChildrenFlat(sections: BoardSectionType[]) {
    let result: BoardSectionType[] = [];
    (sections || []).forEach(x => {
        result.push(omit(x, 'children'), ...(x?.children || []));
    });
    return result;
}

/**
 * 为数组中的每个元素补充多语言字段，并递归处理子节点
 * @param arr 原始数组
 * @param singleFieldName 要处理的字段名
 * @returns 新的数组
 */
function ensureMultiLang(arr: any[], singleFieldName: string): any[] {
    if (!Array.isArray(arr)) {
        return [];
    }

    const ensureMultiLangArray = arr.map(item => {
        let newItem = { ...item };

        // 处理 multiLang 字段
        if (item?.['multiLang'] && typeof item['multiLang'] === 'object') {
            return newItem;
        } else {
            newItem['multiLang'] = {
                [DefaultLanguage]: {
                    [singleFieldName]: item[singleFieldName] ?? '',
                },
            };
        }

        // 递归处理子节点
        if (Array.isArray(item.children) && item.children.length >= 1) {
            newItem.children = ensureMultiLang(item.children, singleFieldName);
        }

        return newItem;
    });
    return ensureMultiLangArray;
}

/** sections生成树形结构 */
function dataS2C(data: BoardDataType) {
    let { sections, games, prompts, ...ret } = data;
    const parsePrompts = prompts ?? {};
    const keys = Object.keys(parsePrompts).map(Number) as PROMPT_TYPE[];
    const _promptsConstants = keys.reduce((acc, cur) => {
        acc[PromptValues[cur]] = parsePrompts[cur];
        return acc;
    }, {} as Record<string, string>);
    const extendConfig = (ret?.extendConfig || {}) as ExtendConfig;
    const originCdks = extendConfig?.cdks || [];
    const sectionType = extendConfig.sectionType ?? SECTION_TYPE.Basic;
    return {
        ...ret,
        extendConfig: {
            ...extendConfig,
            sectionType,
            cdks: originCdks.map((item: any) => `${item.id}&${item.gameVersion}&${item.cdkey || item.cdKey}`),
        },
        games: uniq((games || [])?.map(x => `${x.gameId}${SEPARATE}${x.gameVersion}`)),
        sections: sectionType === SECTION_TYPE.Independent ? sections || [] : sectionsFlatToTree(sections || []),
        prompts: keys,
        ..._promptsConstants,
    };
}

function sectionsFlatToTree(sections: BoardSectionType[]) {
    const sectionsDict = groupBy(sections || [], 'parentId');
    return (sectionsDict[0] || []).map(x => ({
        ...x,
        children: sectionsDict[x.id as any],
    }));
}

function getSectionLangSortValue(item: BoardSectionType, fallbackSort: number) {
    const sort = Number(item?.langSort);
    return Number.isFinite(sort) && sort > 0 ? sort : fallbackSort;
}

function extractSectionLangKeys(sections: BoardSectionType[] = []): string[] {
    if (!sections.length) {
        return [ DefaultLanguage ];
    }

    const langMeta = new Map<string, { sort: number; index: number }>();
    sections.forEach((item, index) => {
        if (!item?.lang) {
            return;
        }

        const nextMeta = {
            sort: getSectionLangSortValue(item, index + 1),
            index,
        };
        const currentMeta = langMeta.get(item.lang);
        if (
            !currentMeta ||
            nextMeta.sort < currentMeta.sort ||
            (nextMeta.sort === currentMeta.sort && nextMeta.index < currentMeta.index)
        ) {
            langMeta.set(item.lang, nextMeta);
        }
    });

    const langs = Array.from(langMeta.entries())
        .sort(([ , a ], [ , b ]) => a.sort - b.sort || a.index - b.index)
        .map(([ lang ]) => lang);
    return langs.length ? langs : [ DefaultLanguage ];
}

function normalizeIndependentSectionTree(
    sections: BoardSectionType[],
    lang: string,
    langSort?: number
): BoardSectionType[] {
    return (sections || []).map((item, index) => ({
        ...omit(item, 'multiLang'),
        lang,
        langSort: langSort ?? item.langSort ?? index + 1,
        sort: index + 1,
        children: (item.children || []).map((child, childIndex) => ({
            ...omit(child, 'multiLang', 'children'),
            lang,
            sort: childIndex + 1,
        })),
    }));
}

function buildIndependentSectionsByLang(sections: BoardSectionType[]) {
    const sectionsByLang = groupBy(
        (sections || []).filter(item => item?.lang),
        'lang'
    );
    const langOrder = extractSectionLangKeys(sections);
    return langOrder.reduce((acc, lang, langIndex) => {
        acc[lang] = normalizeIndependentSectionTree(
            sectionsFlatToTree(sectionsByLang[lang] || []),
            lang,
            langIndex + 1
        );
        return acc;
    }, {} as Record<string, BoardSectionType[]>);
}

function buildIndependentSectionsForApi(sectionsByLang: Record<string, BoardSectionType[]>, langOrder: string[]) {
    return (langOrder?.length ? langOrder : Object.keys(sectionsByLang || {})).flatMap((lang, index) =>
        normalizeIndependentSectionTree(sectionsByLang?.[lang] || [], lang, index + 1)
    );
}

// 抽离多语言字段，方便前端编辑
function extractSortedLangKeys<T extends Record<string, any>, K extends keyof T>(arr: T[]): string[] {
    if (!arr?.length) {
        return [];
    }

    const result = arr
        .map(item => {
            const langObj = item['multiLang'] as Record<string, { sort: number }> | undefined;
            if (!langObj) {
                return [];
            }
            return Object.entries(langObj)
                .sort(([ , v1 ], [ , v2 ]) => v1.sort - v2.sort)
                .map(([ lang ]) => lang);
        })
        .flat();

    if (!result?.length) {
        return [ DefaultLanguage ];
    }

    return Array.from(new Set(result));
}

// 转成后端需要的语言格式
function normalizeLangField<T extends Record<string, any> & { children: T[] }, K extends string>(
    arr: T[],
    langOrder: string[],
    fieldName: K
): T[] {
    if (!Array.isArray(arr)) {
        return [];
    }

    return arr.map(item => {
        const langObj = item['multiLang'];
        let newItem = { ...item };

        if (langObj && typeof langObj === 'object') {
            // 按 langOrder 的顺序重排并加上 sort
            const orderedLangs = langOrder.filter(lang => langObj.hasOwnProperty(lang));

            const newMultiLang = orderedLangs.reduce((acc, lang, index) => {
                const curLangObj = langObj[lang];
                acc[lang] = {
                    ...curLangObj,
                    sort: index + 1,
                };
                return acc;
            }, {} as Record<string, { sort: number } & Record<K, string>>);

            newItem = {
                ...newItem,
                [fieldName]: newMultiLang['en-US']?.[fieldName],
                multiLang: newMultiLang,
            };
        }

        // 递归处理 children
        if (Array.isArray(item.children) && item.children.length > 0) {
            newItem.children = normalizeLangField(item.children, langOrder, fieldName);
        }

        return newItem;
    });
}

// 不同tab表单校验对应的字段名
const validateFieldsByTab = {
    [FORM_TAB_TYPE.Base]: [
        'clubDeployVersion',
        'name',
        'games',
        'sections',
        'sectionsByLang',
        'toolbar',
        'extendConfig.sectionType',
        'extendConfig.introduce',
        'extendConfig.cdks',
        'extendConfig.iosDownloadLink',
        'extendConfig.iosPageckName',
        'extendConfig.androidDownloadLink',
        'extendConfig.androidPageckName',
    ],
    [FORM_TAB_TYPE.System]: [ 'forumCoinAddRules', 'forumCoinExpendRules', 'experienceRules' ],
    [FORM_TAB_TYPE.Image]: [] as string[],
    [FORM_TAB_TYPE.Robot]: [
        'robotEnable',
        'robotImageUrl',
        'prompts',
        'postPrompt',
        'gamePrompt',
        'contentPrompt',
        'dynamicPrompt',
        'answerProbability',
        'aiProbability',
    ],
    [FORM_TAB_TYPE.BindAccount]: [
        'extendConfig.actorBindTypes',
        'extendConfig.clubIosDownloadLink',
        'extendConfig.clubAndroidPackageName',
    ],
};

interface BoardCreateProps {
    data: BoardDataType;
    visible: boolean;
    onOk?: () => void;
    onCancel?: () => void;
}
interface BoardCreatePropsMobx extends BoardCreateProps, Pick<StoreType, 'GameContext' | 'User'> {}

function BoardCreate(props: BoardCreateProps) {
    const [ modalForm ] = Form.useForm();
    const { data, visible, onOk, onCancel } = props as BoardCreatePropsMobx;

    const isCreate = useMemo(() => !data.name, [ data ]);

    const [ initVal, setinitVal ] = useState<any>();
    const [ loading, setLoading, getLoading ] = useSyncState(false);
    const [ submitTime, setSubmitTime ] = useState(Date.now()); // 确认提交时间

    const [ activeKey, setActiveKey ] = useState<FORM_TAB_TYPE>(FORM_TAB_TYPE.Base);

    // 语言选择
    const [ toolSelectedLanguages, setToolSelectedLanguages ] = useState<string[]>([ DefaultLanguage ]);
    const [ sectionSelectedLanguages, setSectionSelectedLanguages ] = useState<string[]>([ DefaultLanguage ]);
    const [ growthSystemLanguages, setGrowthSystemLanguages ] = useState<string[]>([ DefaultLanguage ]);

    const [ toolActiveKey, setToolActiveKey ] = useState<string>(DefaultLanguage);
    const [ sectionActiveKey, setSectionActiveKey ] = useState<string>(DefaultLanguage);
    const [ growthActiveKey, setGrowthActiveKey ] = useState<string>(DefaultLanguage);

    useEffect(() => {
        if (visible) {
            setActiveKey(FORM_TAB_TYPE.Base);
            // Prevent stale independent sections cache from previous open/edit sessions.
            modalForm.setFields([
                {
                    name: 'sectionsByLang',
                    value: undefined,
                },
            ]);
            let dataClone: any = cloneDeep(data);
            if (dataClone.name) {
                dataClone = dataS2C(dataClone);
            }
            // 海外语言转换
            if (data.clubDeployVersion === CLUB_ENVIRONMENT_ENUM.EN) {
                setToolSelectedLanguages(extractSortedLangKeys(dataClone.toolbar));
                setGrowthSystemLanguages(extractSortedLangKeys(dataClone.growthSystems));
                const sectionType = get(dataClone, [ 'extendConfig', 'sectionType' ], SECTION_TYPE.Basic);
                if (sectionType === SECTION_TYPE.Independent) {
                    const sectionLanguages = extractSectionLangKeys(dataClone.sections);
                    setSectionSelectedLanguages(sectionLanguages);
                    setSectionActiveKey(sectionLanguages[0] || DefaultLanguage);
                    dataClone = {
                        ...cloneDeep(dataClone),
                        toolbar: ensureMultiLang(clone(dataClone.toolbar), 'name'),
                        sectionsByLang: buildIndependentSectionsByLang(clone(dataClone.sections)),
                        growthSystems: ensureMultiLang(clone(dataClone.growthSystems), 'message'),
                    };
                } else {
                    const sectionLanguages = extractSortedLangKeys(dataClone.sections);
                    setSectionSelectedLanguages(sectionLanguages);
                    setSectionActiveKey(sectionLanguages[0] || DefaultLanguage);
                    dataClone = {
                        ...cloneDeep(dataClone),
                        toolbar: ensureMultiLang(clone(dataClone.toolbar), 'name'),
                        sections: ensureMultiLang(clone(dataClone.sections), 'name'),
                        growthSystems: ensureMultiLang(clone(dataClone.growthSystems), 'message'),
                    };
                }
                setToolActiveKey(DefaultLanguage);
                setGrowthActiveKey(DefaultLanguage);
            }

            setinitVal(dataClone);
            modalForm.setFieldsValue(dataClone);
        } else {
            modalForm.resetFields();
        }
        setSubmitTime(Date.now());
    }, [ data, modalForm, visible ]);

    // 切换失败的语种
    const handleMultiLangErrorSwitch = useCallback((e: any, errorField: string) => {
        const errorFieldList = e.errorFields?.[0]?.name;
        if (!errorFieldList?.length) {
            return;
        }

        if (errorFieldList[0] === 'sectionsByLang') {
            errorFieldList[1] && setSectionActiveKey(errorFieldList[1]);
            return;
        }

        if (!errorFieldList?.includes('multiLang')) {
            return;
        }

        const language = errorFieldList[errorFieldList.length - 2];
        if (!language) {
            return;
        }

        if (errorField === 'toolbar') {
            setToolActiveKey(language);
        } else {
            setSectionActiveKey(language);
        }
    }, []);

    const handleSubmit = useCallback(async () => {
        if (getLoading()) {
            return;
        }
        try {
            setLoading(true);
            let {
                sections,
                sectionsByLang = {},
                toolbar = [],
                forumCoinAddRules,
                forumCoinExpendRules,
                imageUrl,
                experienceRules,
                toolMode,
                sectionMode,
                games,
                growthSystems,
                clubDeployVersion,
                homeUrl,
                newseUrl,
                postUrl,
                startupPageUrl,
                myImageUrl,
                rewardTaskUrl,
                playerCircleUrl,
                holidaySkinEnabled,
                robotImageUrl,
                prompts,
                postPrompt,
                gamePrompt,
                contentPrompt,
                dynamicPrompt,
                mayAskSetting,
                normalImage,
                greetImage,
                petImage,
                extendConfig = {},
                ...ret
            } = await modalForm.validateFields();
            const sectionType = get(extendConfig, 'sectionType', SECTION_TYPE.Basic);
            /** 去除功能栏图表必填校验 */
            // if (
            //     holidaySkinEnabled === BASIC_CHECK_STATUS.Open &&
            //     [ playerCircleUrl, rewardTaskUrl, myImageUrl, postUrl, newseUrl, homeUrl ].some(v => !v)
            // ) {
            //     return message.warn('节假日皮肤开启时，功能栏图标不能为空！');
            // }
            toolbar = toolMode
                ? toolbar.map((x: any, index: number) => ({
                      ...x,
                      sort: index + 1,
                      icon: x.icon ? new URL(x.icon)?.pathname?.slice(1) : '',
                      notificationMember: x.notificationMember === true ? 1 : 0,
                  }))
                : [];
            sections =
                sectionType === SECTION_TYPE.Independent
                    ? buildIndependentSectionsForApi(sectionsByLang, sectionSelectedLanguages)
                    : sections.map((x: any, index: number) => ({
                          ...x,
                          sort: index + 1,
                          children: x?.children?.map((child: any, childIndex: number) => ({
                              ...child,
                              sort: childIndex + 1,
                          })),
                      }));

            // 额外处理一下多语言
            if (data.clubDeployVersion === CLUB_ENVIRONMENT_ENUM.EN) {
                toolbar = normalizeLangField(clone(toolbar), toolSelectedLanguages, 'name');
                if (sectionType === SECTION_TYPE.Basic) {
                    sections = normalizeLangField(clone(sections), sectionSelectedLanguages, 'name');
                }
                growthSystems = normalizeLangField(clone(growthSystems), growthSystemLanguages, 'message');
            }

            let param = {
                isBC: sectionMode.includes(SECTION_MODE.IsBC) ? 1 : 0,
                isTourist: sectionMode.includes(SECTION_MODE.IsTourist) ? 1 : 0,
                imageUrl: imageUrl ? new URL(imageUrl)?.pathname?.slice(1) : '',
                homeUrl: homeUrl ? new URL(homeUrl)?.pathname?.slice(1) : '',
                rewardTaskUrl: rewardTaskUrl ? new URL(rewardTaskUrl)?.pathname?.slice(1) : '',
                myImageUrl: myImageUrl ? new URL(myImageUrl)?.pathname?.slice(1) : '',
                newseUrl: newseUrl ? new URL(newseUrl)?.pathname?.slice(1) : '',
                postUrl: postUrl ? new URL(postUrl)?.pathname?.slice(1) : '',
                playerCircleUrl: playerCircleUrl ? new URL(playerCircleUrl)?.pathname?.slice(1) : '',
                startupPageUrl: startupPageUrl ? new URL(startupPageUrl)?.pathname?.slice(1) : '',
                toolbar,
                sections,
                games: games.map((x: string) => ({
                    gameId: Number(x.split(SEPARATE)[0]),
                    gameVersion: x.split(SEPARATE)[1],
                })),
                extendConfig: {
                    ...extendConfig,
                    sectionType,
                    ...(extendConfig.cdkEnable
                        ? {
                              cdks: (extendConfig?.cdks || []).map((x: string) => {
                                  const arr = x.split('&');
                                  return {
                                      id: arr[0],
                                      gameVersion: arr[1],
                                      cdKey: arr[2],
                                  };
                              }),
                          }
                        : {}),
                    ...(extendConfig.clubIosIcon
                        ? { clubIosIcon: new URL(extendConfig.clubIosIcon)?.pathname?.slice(1) }
                        : {}),
                    ...(extendConfig.clubAndroidIcon
                        ? { clubAndroidIcon: new URL(extendConfig.clubAndroidIcon)?.pathname?.slice(1) }
                        : {}),
                    ...(extendConfig.actorDefaultFace
                        ? { actorDefaultFace: new URL(extendConfig.actorDefaultFace)?.pathname?.slice(1) }
                        : {}),
                    ...(extendConfig.goods && extendConfig.goods?.length > 0
                        ? {
                              goods: extendConfig.goods.map((item: RewardGoodsItem) => ({
                                  ...item,
                                  image: item.image ? getPathName(item.image).replace(/^\/+/, '') : '',
                              })),
                          }
                        : {}),
                },
                userRules: [ ...forumCoinAddRules, ...forumCoinExpendRules, ...experienceRules ],
                holidaySkinEnabled,
                growthSystems: ret.growthSystemEnable
                    ? growthSystems
                    : growthSystems.every((v: { id: string }) => !v.id)
                    ? []
                    : growthSystems,
                robotImageUrl: getPathName(robotImageUrl),
                prompts: {
                    [PROMPT_TYPE.Post]: postPrompt,
                    [PROMPT_TYPE.Game]: gamePrompt,
                    [PROMPT_TYPE.Content]: contentPrompt,
                    [PROMPT_TYPE.Dynamic]: dynamicPrompt,
                },
                ...(mayAskSetting && mayAskSetting.length > 0
                    ? {
                          mayAskSetting: mayAskSetting.map((x: any) => ({
                              ...x,
                              iconUrl: x.iconUrl ? new URL(x.iconUrl)?.pathname?.slice(1) : '',
                          })),
                      }
                    : {}),
                openMode: data?.openMode ? data.openMode : OPEN_MODE.Default,
                normalImage: normalImage ? getPathName(normalImage).replace(/^\/+/, '') : '',
                greetImage: greetImage ? getPathName(greetImage).replace(/^\/+/, '') : '',
                petImage: petImage ? getPathName(petImage).replace(/^\/+/, '') : '',
                ...ret,
            };
            const { code, msg } = await (isCreate
                ? addBoard(param, clubDeployVersion)
                : editBoard(
                      {
                          ...param,
                          sectionDelete: differenceBy(data?.sections || [], sectionsChildrenFlat(sections), 'id').map(
                              item => item.id
                          ),
                          toolbarDelete: differenceBy(data?.toolbar, toolbar || [], 'id').map(item => item.id),
                      },
                      clubDeployVersion
                  ));
            setLoading(false);
            if (code === 0) {
                onOk?.();
                message.success(`版块【${ret.name}】${isCreate ? '新建' : '编辑'}成功！`);
            } else {
                message.error(msg);
            }
        } catch (err) {
            setSubmitTime(Date.now());
            let e = err as any;
            setLoading(false);
            if (e?.errorFields?.length) {
                const errorField = e.errorFields?.[0]?.name?.join('.');
                const tabKeys = Object.keys(validateFieldsByTab) as FORM_TAB_TYPE[];
                for (let i = 0; i < tabKeys.length; i++) {
                    const key = tabKeys[i];
                    const fields = validateFieldsByTab[key];
                    if (fields.some(field => errorField === field || errorField?.startsWith(`${field}.`))) {
                        setActiveKey(key);
                        // 切换失败的语种
                        handleMultiLangErrorSwitch(e, errorField);
                        break;
                    }
                }
                throw e;
            } else {
                message.error(typeof e === 'string' ? e : '操作失败');
                throw e;
            }
        }
    }, [
        data.clubDeployVersion,
        data.openMode,
        data?.sections,
        data?.toolbar,
        getLoading,
        growthSystemLanguages,
        handleMultiLangErrorSwitch,
        isCreate,
        modalForm,
        onOk,
        sectionSelectedLanguages,
        setLoading,
        toolSelectedLanguages,
    ]);

    const handleReset = useCallback(() => {
        modalForm.resetFields();
    }, [ modalForm ]);

    return (
        <Drawer
            destroyOnClose
            getContainer={useContentDialogContainer()}
            width={1100}
            title={`${isCreate ? '新增' : '编辑'}版块`}
            visible={visible}
            onClose={() => {
                modalForm.resetFields();
                onCancel?.();
            }}
            className="big-player-board"
            footer={[
                <Button
                    style={{ float: 'right', marginRight: 16 }}
                    key="0"
                    type="primary"
                    loading={loading}
                    onClick={() => handleSubmit()}
                >
                    提交
                </Button>,
                <Button style={{ float: 'right', marginRight: 16 }} key="1" onClick={() => handleReset()}>
                    重置
                </Button>,
            ]}
        >
            <Tabs activeKey={activeKey} onTabClick={key => setActiveKey(key as FORM_TAB_TYPE)}>
                <Tabs.TabPane tab="基础信息" key={FORM_TAB_TYPE.Base}></Tabs.TabPane>
                <Tabs.TabPane tab="会员体系设置" key={FORM_TAB_TYPE.System}></Tabs.TabPane>
                <Tabs.TabPane tab="图片元素" key={FORM_TAB_TYPE.Image}></Tabs.TabPane>
                <Tabs.TabPane tab="AI机器人" key={FORM_TAB_TYPE.Robot}></Tabs.TabPane>
                <Tabs.TabPane tab="账号绑定" key={FORM_TAB_TYPE.BindAccount}></Tabs.TabPane>
            </Tabs>
            <Form form={modalForm} initialValues={initVal} labelCol={{ span: 3 }} scrollToFirstError>
                <BoardCreateProvider
                    clubDeployVersion={data.clubDeployVersion || CLUB_ENVIRONMENT_ENUM.ZH}
                    boardId={data?.id}
                    toolSelectedLanguages={toolSelectedLanguages}
                    setToolSelectedLanguages={setToolSelectedLanguages}
                    sectionSelectedLanguages={sectionSelectedLanguages}
                    setSectionSelectedLanguages={setSectionSelectedLanguages}
                    growthSystemLanguages={growthSystemLanguages}
                    setGrowthSystemLanguages={setGrowthSystemLanguages}
                    toolActiveKey={toolActiveKey}
                    setToolActiveKey={setToolActiveKey}
                    sectionActiveKey={sectionActiveKey}
                    setSectionActiveKey={setSectionActiveKey}
                    growthActiveKey={growthActiveKey}
                    setGrowthActiveKey={setGrowthActiveKey}
                >
                    <Form.Item name="id" label="版块id" hidden>
                        <Input />
                    </Form.Item>
                    <div style={{ display: activeKey === FORM_TAB_TYPE.Base ? 'block' : 'none' }}>
                        <BaseForm
                            data={data as BoardEditParams}
                            modalForm={modalForm}
                            isCreate={isCreate}
                            submitTime={submitTime}
                        />
                    </div>
                    <div style={{ display: activeKey === FORM_TAB_TYPE.System ? 'block' : 'none' }}>
                        <SystemForm data={data as BoardEditParams} modalForm={modalForm} isCreate={isCreate} />
                    </div>
                    <div style={{ display: activeKey === FORM_TAB_TYPE.Image ? 'block' : 'none' }}>
                        <ImageForm data={data as BoardEditParams} />
                    </div>
                    <div style={{ display: activeKey === FORM_TAB_TYPE.Robot ? 'block' : 'none' }}>
                        <RobotForm data={data as BoardEditParams} modalForm={modalForm} isCreate={isCreate} />
                    </div>
                    <div style={{ display: activeKey === FORM_TAB_TYPE.BindAccount ? 'block' : 'none' }}>
                        <AccountForm data={data as BoardEditParams} form={modalForm} />
                    </div>
                </BoardCreateProvider>
            </Form>
        </Drawer>
    );
}
export default inject('GameContext', 'User')(observer(BoardCreate));
