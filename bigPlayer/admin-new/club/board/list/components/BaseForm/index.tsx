import {
    Button,
    Form,
    Input,
    Switch,
    Tooltip,
    Select,
    Popover,
    Checkbox,
    TreeSelect,
    Tag,
    Modal,
    Space,
    message,
    Radio,
} from 'antd';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    DoubleLeftOutlined,
    DoubleRightOutlined,
    EditOutlined,
    InfoCircleOutlined,
    MinusCircleOutlined,
    PlusCircleOutlined,
    PlusOutlined,
    QuestionCircleOutlined,
} from '@ant-design/icons';
import { arrayMove } from 'react-sortable-hoc';
import { inject, observer } from 'mobx-react';
import type { FormInstance, Rule } from 'antd/es/form';
import { get, isArray, keyBy, map, cloneDeep, omit, isEqual, uniq } from 'lodash';

import UploadImg from '@/components/uploadFile/UploadImg';
import SortableTable from '@/components/q1Table/sortableTable';
import NumberSwitch from '@/components/NumberSwitch';
import { StoreType } from '@/store/config';
import { boardCheckName, getCdkList } from '@/api/club';
import { getGameenvV1Version, getAllChannel } from '@/api/game-env';
import { getAppConfigCenterList } from '@/api/configCenter';
import { getAllTagSettingList } from '@/api/clubTag';
import { useContentDialogContainer } from '@/context';
import { normalRuleValidator } from '@/utils/lib';
import useLocalStorage from '@/hooks/dom/useLocalStorage';
import CheckBoxNumber from '@/components/CheckBoxFormItem';
import { inputEmojiRule } from '@/utils/helper';

import {
    ClubDeployVersionOptionsData,
    BoardEditParams,
    SectionModeOptions,
    TreeDataType,
    CLUB_ENVIRONMENT_ENUM,
    MAX_PUBLICITYLABEL_LEN,
    PUBLICITYVISIBILE,
    CLUB_DEPLOY_VERSION,
    DownloadTypeOptions,
    DOWNLOAD_TYPE_ENUM,
    SectionTypeOptions,
    SECTION_TYPE,
} from '@ts/club';
import { ChannelType, GameVersionTypeV2 } from '@ts/gameContext';
import { TagSettingListItem } from '@ts/clubTag';

import SecetionItem from './Sections';
import { SEPARATE } from '../Create';
import { defaultData } from '../../defaultVal';
import { useClubUploadOption } from '../../../hooks/useClubUploadOption';
import { useBoardCreate } from '../../../context/boardCreateProvider';
import { LanguageTabWrapper } from '../Create/LanguageTabWrapper';

/** 版块名称最大字符 */
let NAME_LENGTH_MAX = 10;
/** 功能栏类别名称最大字符 */
export const SECTION_NAME_LENGTH_MAX = 30;
/** 最多设置10个类别 */
export const SECTION_LENGTH_MAX = 10;
/** 功能栏链接地址最大字符 */
export let URL_LENGTH_MAX = 1024;

function createIndependentSectionDefaults(lang: string, langSort?: number) {
    return cloneDeep(get(defaultData, 'sections', [])).map((item: any) => ({
        ...omit(item, 'multiLang'),
        lang,
        langSort,
        children: (item.children || []).map((child: any) => ({
            ...omit(child, 'multiLang'),
            lang,
        })),
    }));
}

function getIndependentSectionsByLang(currentSectionsByLang: Record<string, any[]>, langs: string[]) {
    return langs.reduce((acc, lang, index) => {
        acc[lang] = currentSectionsByLang[lang] || createIndependentSectionDefaults(lang, index + 1);
        return acc;
    }, {} as Record<string, any[]>);
}

function toBasicSectionsFromIndependent(sections: any[] = [], lang: string) {
    return cloneDeep(sections).map((item: any) => ({
        ...omit(item, 'lang'),
        name: item.name || '',
        multiLang: {
            [lang]: {
                name: item.name || '',
            },
        },
        children: (item.children || []).map((child: any) => ({
            ...omit(child, 'lang'),
            name: child.name || '',
            multiLang: {
                [lang]: {
                    name: child.name || '',
                },
            },
        })),
    }));
}

// 功能栏是否展开key值
const ToolBarKey = 'club-toolbar-expanded';

interface BaseFormProps {
    data: BoardEditParams;
    modalForm: FormInstance;
    isCreate: boolean;
    submitTime?: number;
}
let defaultUrlDemo = { urlDemo: '', params: '' };
interface BaseFormMobxProps extends BaseFormProps, Pick<StoreType, 'GameContext' | 'Game'> {}
const BaseForm = function BaseForm(props: BaseFormProps) {
    const {
        data,
        modalForm,
        isCreate,
        GameContext: { gameMap, getGameVersionName },
        ...otherProps
    } = props as BaseFormMobxProps;

    const [ gameListOptions, setgameListOptions ] = useState<TreeDataType[]>([]);
    const [ clubUrlDemo, setclubUrlDemo ] = useState(defaultUrlDemo);

    const ClubUploadOption = useClubUploadOption({ clubDeployVersion: data.clubDeployVersion || '' });
    // 获取所有游戏
    const fetchGame = useCallback(async () => {
        const res = await getGameenvV1Version();
        let treeData = res
            .filter(x => gameMap?.[x?.gameId]?.state === 1) // 仅展示gameList存在的gameId，且state=1 // 启用状态（0:禁用,1:启用）
            .reduce((previousItem: any[], currentValue: GameVersionTypeV2) => {
                let matchIndex = previousItem?.findIndex(cur => cur.gameId === currentValue.gameId);
                let curItem = {
                    ...currentValue,
                    title: `${currentValue.name}(${currentValue.key})`,
                    value: `${currentValue.gameId}${SEPARATE}${currentValue.key}`,
                    key: `${currentValue.gameId}${SEPARATE}${currentValue.key}`,
                };
                if (matchIndex >= 0) {
                    previousItem?.[matchIndex]?.children?.push(curItem);
                } else {
                    previousItem.push({
                        ...currentValue,
                        title: `${currentValue.gameName}(${currentValue.gameId})`,
                        value: currentValue.gameId,
                        key: currentValue.gameId,
                        children: [ curItem ],
                    });
                }
                return previousItem;
            }, []);
        setgameListOptions(treeData);
    }, [ gameMap ]);

    const [ channelList, setChannelList ] = useState<Array<ChannelType>>([]);
    const [ tagSettingList, setTagSettingList ] = useState<TagSettingListItem[]>([]);
    const [ tagSettingLoading, setTagSettingLoading ] = useState(false);

    const {
        languageOptions,
        isEN,
        toolSelectedLanguages,
        setToolSelectedLanguages,
        sectionSelectedLanguages,
        setSectionSelectedLanguages,
        toolActiveKey,
        setToolActiveKey,
        sectionActiveKey,
        setSectionActiveKey,
    } = useBoardCreate();
    const [ sectionType, setSectionType ] = useState(
        () => modalForm.getFieldValue([ 'extendConfig', 'sectionType' ]) ?? SECTION_TYPE.Basic
    );

    useEffect(() => {
        if (!isEN || sectionType !== SECTION_TYPE.Independent) {
            return;
        }

        const currentSectionsByLang = modalForm.getFieldValue('sectionsByLang') || {};
        const nextSectionsByLang = getIndependentSectionsByLang(currentSectionsByLang, sectionSelectedLanguages);

        if (!isEqual(currentSectionsByLang, nextSectionsByLang)) {
            modalForm.setFields([
                {
                    name: 'sectionsByLang',
                    value: nextSectionsByLang,
                },
            ]);
        }

        if (!sectionSelectedLanguages.includes(sectionActiveKey)) {
            setSectionActiveKey(sectionSelectedLanguages[0] || '');
        }
    }, [ isEN, modalForm, sectionActiveKey, sectionSelectedLanguages, sectionType, setSectionActiveKey ]);

    // 获取所有渠道
    const fetchChannel = useCallback(async () => {
        const data = await getAllChannel();
        if (data) {
            setChannelList(data);
        }
    }, []);

    const fetchTagSettingList = useCallback(async () => {
        if (!data?.id || !data?.clubDeployVersion) {
            setTagSettingList([]);
            return;
        }
        setTagSettingLoading(true);
        try {
            const { code, data: tagList = [] } = await getAllTagSettingList(
                { boardId: data.id },
                data.clubDeployVersion as CLUB_DEPLOY_VERSION
            );
            if (code === 0 && tagList?.length) {
                setTagSettingList(tagList);
            } else {
                setTagSettingList([]);
            }
        } catch (error) {
            message.error('获取用户标签配置失败');
            setTagSettingList([]);
        } finally {
            setTagSettingLoading(false);
        }
    }, [ data?.clubDeployVersion, data?.id ]);

    // 获取版块功能栏地址说明
    const fetchAppConfig = useCallback(async () => {
        const res = await getAppConfigCenterList({ tableName: 'clubUrlDemo' });
        setclubUrlDemo(get(res, '0', defaultUrlDemo));
    }, []);

    useEffect(() => {
        !data?.languageIds &&
            languageOptions?.length &&
            modalForm.setFields([
                {
                    name: 'languageIds',
                    value: [ languageOptions[0].value ],
                },
            ]);
    }, [ data?.languageIds, languageOptions, modalForm ]);

    // 校验名字重复
    const nameRepeatValidate = useCallback(
        (name: string, index: number, required: boolean) => {
            return [
                {
                    validator: (_rule: Rule, value: string) => {
                        const list = modalForm.getFieldValue(name);
                        const names = map(list, 'name');
                        if (!value && required) {
                            return Promise.reject('请输入');
                        } else {
                            names.splice(index, 1);
                            if (names.findIndex(item => item === value) !== -1) {
                                return Promise.reject('名字不能重复');
                            } else {
                                return Promise.resolve();
                            }
                        }
                    },
                },
            ];
        },
        [ modalForm ]
    );

    useEffect(() => {
        Promise.all([ fetchGame(), fetchAppConfig(), fetchChannel(), fetchTagSettingList() ]);
    }, [ data.clubDeployVersion, fetchAppConfig, fetchChannel, fetchGame, fetchTagSettingList ]);

    const onChangeSort = useCallback(
        ({ oldIndex, newIndex }) => {
            let toolbar = modalForm.getFieldValue('toolbar');
            modalForm.setFields([
                {
                    name: 'toolbar',
                    value: arrayMove(toolbar, oldIndex, newIndex),
                },
            ]);
        },
        [ modalForm ]
    );

    const [ , setExpanded, { getStorageSync } ] = useLocalStorage(ToolBarKey, { expanded: false });

    const handleExpanded = useCallback(
        (value: boolean) => {
            setExpanded({
                expanded: value,
            });
        },
        [ setExpanded ]
    );

    const [ cdkList, setCdkList ] = useState<any[]>([]);
    const [ cdkSearchValue, setCdkSearchValue ] = useState('');

    const flatCdkOptions = useMemo(() => {
        const flat: Array<{ label: string; value: string }> = [];
        (cdkList || []).forEach((grp: any) => {
            (grp?.options || []).forEach((opt: any) => flat.push(opt));
        });
        return flat;
    }, [ cdkList ]);

    const cdkValueByCdkey = useMemo(() => {
        const m = new Map<string, string>();
        flatCdkOptions.forEach(({ label, value }) => m.set(String(label), String(value)));
        return m;
    }, [ flatCdkOptions ]);

    const cdkValueById = useMemo(() => {
        const m = new Map<string, string>();
        flatCdkOptions.forEach(({ value }) => {
            const idStr = String(value).split('&')[0];
            m.set(idStr, String(value));
        });
        return m;
    }, [ flatCdkOptions ]);

    const cdkValueByValue = useMemo(() => {
        const m = new Map<string, string>();
        flatCdkOptions.forEach(({ value }) => m.set(String(value), String(value)));
        return m;
    }, [ flatCdkOptions ]);

    const handleFillCdk = useCallback(() => {
        const parts = cdkSearchValue.split(',').map(s => s.trim());
        if (parts.length === 0) {
            return;
        }
        const foundValues: string[] = [];
        const unValidate: string[] = [];
        parts.forEach(tok => {
            if (cdkValueByCdkey.has(tok)) {
                foundValues.push(cdkValueByCdkey.get(tok)!);
                return;
            }
            if (cdkValueById.has(tok)) {
                foundValues.push(cdkValueById.get(tok)!);
                return;
            }
            if (cdkValueByValue.has(tok)) {
                foundValues.push(cdkValueByValue.get(tok)!);
                return;
            }
            unValidate.push(tok);
        });
        const selected = modalForm.getFieldValue([ 'extendConfig', 'cdks' ]) || [];
        // 如果输入都已被选中或包含，则不做任何处理
        if (
            selected.length > 0 &&
            foundValues.length > 0 &&
            selected.some((item: string) => foundValues.includes(item))
        ) {
            return;
        }
        const merged = uniq([ ...selected, ...foundValues ]);
        modalForm.setFields([
            {
                name: [ 'extendConfig', 'cdks' ],
                value: merged,
            },
        ]);
        if (unValidate.length > 0) {
            message.warning(`兑换码：${unValidate.join('，')} 不存在`);
        }
        setCdkSearchValue('');
    }, [ cdkSearchValue, cdkValueByCdkey, cdkValueById, cdkValueByValue, modalForm ]);

    const onChangeGame = useCallback(
        async (games, init?: boolean) => {
            let gameVersions = [];
            if (games && games.length > 0) {
                if (init) {
                    gameVersions = map(games, 'gameVersion');
                } else {
                    gameVersions = (games || []).map((item: string) => item.split(SEPARATE)[1]);
                }
                const ret = await getCdkList(
                    { gameVersions: gameVersions.join(',') },
                    (data?.clubDeployVersion || '') as CLUB_DEPLOY_VERSION
                );
                if (ret.code === 0 && ret.data) {
                    const list =
                        ret.data.map(item => ({
                            label: item.cdkey,
                            value: `${item.id}&${item.gameVersion}&${item.cdkey}`,
                            gameStr: `${gameMap[item.gameId]?.name}-${getGameVersionName(
                                item.gameId,
                                item.gameVersion
                            )}`,
                        })) || [];
                    let options = _(list)
                        .groupBy('gameStr') // 按 gameStr 分组
                        .map((items, key) => ({
                            label: key, // 分组标题（如: xxxx游戏&xxxx版本）
                            options: items.map(i => ({
                                label: i.label,
                                value: i.value,
                            })),
                        }))
                        .value();
                    setCdkList(options);
                } else {
                    setCdkList([]);
                }
            } else {
                setCdkList([]);
            }
        },
        [ data?.clubDeployVersion, gameMap, getGameVersionName ]
    );

    useEffect(() => {
        if (data?.games && data?.games.length > 0) {
            onChangeGame(data?.games, true);
        }
    }, [ data?.games, onChangeGame ]);

    return (
        <div>
            <Form.Item name="clubDeployVersion" label="数据中心" wrapperCol={{ span: 7 }}>
                <Select options={ClubDeployVersionOptionsData} disabled></Select>
            </Form.Item>
            <Form.Item
                name="name"
                label="版块名称"
                normalize={val => val?.trim()}
                required
                hasFeedback
                rules={[
                    {
                        validator: async (_: Rule, value: string) => {
                            if (!value || !value.trim()) {
                                return Promise.reject('请输入');
                            }
                            if (value) {
                                const res = await boardCheckName(
                                    {
                                        id: data?.id,
                                        name: value,
                                    },
                                    data?.clubDeployVersion || ''
                                );
                                if (res.data) {
                                    return Promise.reject('版块名称已存在，请重新输入！');
                                }
                            }
                            return Promise.resolve();
                        },
                    },
                ]}
                validateTrigger="onBlur"
                wrapperCol={{ span: 7 }}
            >
                <Input allowClear maxLength={NAME_LENGTH_MAX} />
            </Form.Item>
            <Form.Item
                required
                label="版块介绍"
                name={[ 'extendConfig', 'introduce' ]}
                rules={[ { required: true, message: '请输入' }, inputEmojiRule ]}
                wrapperCol={{ span: 7 }}
            >
                <Input allowClear maxLength={50} />
            </Form.Item>
            <Form.Item name="games" label="游戏选择" rules={normalRuleValidator('请选择')}>
                <TreeSelect
                    onChange={val => onChangeGame(val)}
                    multiple={true}
                    treeCheckable={true}
                    treeData={gameListOptions}
                    allowClear
                ></TreeSelect>
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, next) => prev.clubDeployVersion !== next.clubDeployVersion}>
                {({ getFieldValue }) => {
                    const clubDeployVersion = getFieldValue('clubDeployVersion');
                    return clubDeployVersion === CLUB_ENVIRONMENT_ENUM.EN ? (
                        <Form.Item
                            name="languageIds"
                            label={
                                <Space>
                                    <span>语言选择</span>
                                    <Tooltip title="该语言选择为海外游戏设置切换语言时，不同语言对应的不同的社区版块。版块与语言ID映射的关系表在配置中心languageClub中进行维护">
                                        <QuestionCircleOutlined />
                                    </Tooltip>
                                </Space>
                            }
                            rules={normalRuleValidator('请选择')}
                            wrapperCol={{ span: 7 }}
                        >
                            <Select mode="multiple">
                                {languageOptions.map((item, idx) => {
                                    return (
                                        <Select.Option value={item.value} key={item.value}>
                                            <div className="flex-items-center flex-content-between">
                                                {item.label}
                                                {idx === 0 && <Tag color="blue">默认</Tag>}
                                            </div>
                                        </Select.Option>
                                    );
                                })}
                            </Select>
                        </Form.Item>
                    ) : null;
                }}
            </Form.Item>

            <Form.Item name="sectionMode" label="可见模式" rules={normalRuleValidator('请选择')}>
                <Checkbox.Group options={SectionModeOptions}></Checkbox.Group>
            </Form.Item>
            <Form.Item label="首页模块" required className="mb-0">
                <div className="flex-items-center">
                    <Form.Item name="encyclopediaVisible">
                        <CheckBoxNumber>攻略站功能</CheckBoxNumber>
                    </Form.Item>
                    <Form.Item name="publicityVisible">
                        <CheckBoxNumber>品宣模块</CheckBoxNumber>
                    </Form.Item>
                    <Form.Item name="creatorEnable">
                        <CheckBoxNumber>创作者中心</CheckBoxNumber>
                    </Form.Item>
                    <Form.Item name="findEnable">
                        <CheckBoxNumber>发现</CheckBoxNumber>
                    </Form.Item>
                    <Form.Item
                        noStyle
                        shouldUpdate={(prev, next) => prev.encyclopediaVisible !== next.encyclopediaVisible}
                    >
                        {({ getFieldValue }) => {
                            const encyclopediaVisible = getFieldValue('encyclopediaVisible');
                            if (encyclopediaVisible) {
                                return (
                                    <Form.Item name="encyclopediaIsSubmittable">
                                        <CheckBoxNumber>玩家投稿</CheckBoxNumber>
                                    </Form.Item>
                                );
                            } else {
                                return null;
                            }
                        }}
                    </Form.Item>
                    <Form.Item name="badgeEnabled">
                        <CheckBoxNumber>徽章功能</CheckBoxNumber>
                    </Form.Item>
                    <Form.Item name={[ 'extendConfig', 'downloadEnable' ]}>
                        <CheckBoxNumber>游戏下载</CheckBoxNumber>
                    </Form.Item>
                    <Form.Item name={[ 'extendConfig', 'cdkEnable' ]}>
                        <CheckBoxNumber>兑换码</CheckBoxNumber>
                    </Form.Item>
                </div>
            </Form.Item>
            <Form.Item
                shouldUpdate={(prev, next) => prev.extendConfig?.downloadEnable !== next.extendConfig?.downloadEnable}
                noStyle
            >
                {({ getFieldValue }) => {
                    const downloadEnable = getFieldValue([ 'extendConfig', 'downloadEnable' ]);
                    if (downloadEnable) {
                        return (
                            <>
                                <Form.Item
                                    label="下载方式选择"
                                    name={[ 'extendConfig', 'downloadTypes' ]}
                                    required
                                    rules={[ { required: true, message: '至少选择1个下载方式' } ]}
                                >
                                    <Checkbox.Group options={DownloadTypeOptions} />
                                </Form.Item>
                                <Form.Item
                                    shouldUpdate={(prev, next) =>
                                        prev.extendConfig?.downloadTypes !== next.extendConfig?.downloadTypes
                                    }
                                    noStyle
                                >
                                    {({ getFieldValue }) => {
                                        const downloadTypes = getFieldValue([ 'extendConfig', 'downloadTypes' ]);
                                        if (downloadTypes?.length) {
                                            return (
                                                <>
                                                    {downloadTypes.includes(DOWNLOAD_TYPE_ENUM.Android) ? (
                                                        <>
                                                            <Form.Item
                                                                label="Android商店地址"
                                                                name={[ 'extendConfig', 'androidDownloadLink' ]}
                                                                required
                                                                rules={[ { required: true, message: '请输入' } ]}
                                                                wrapperCol={{ span: 7 }}
                                                            >
                                                                <Input maxLength={200} />
                                                            </Form.Item>
                                                            <Form.Item
                                                                label="Android Scheme链接"
                                                                name={[ 'extendConfig', 'androidPackageName' ]}
                                                                required
                                                                rules={[ { required: true, message: '请输入' } ]}
                                                                wrapperCol={{ span: 7 }}
                                                            >
                                                                <Input maxLength={200} />
                                                            </Form.Item>
                                                        </>
                                                    ) : null}
                                                    {downloadTypes.includes(DOWNLOAD_TYPE_ENUM.IOS) ? (
                                                        <>
                                                            <Form.Item
                                                                label="IOS商店地址"
                                                                name={[ 'extendConfig', 'iosDownloadLink' ]}
                                                                required
                                                                rules={[ { required: true, message: '请输入' } ]}
                                                                wrapperCol={{ span: 7 }}
                                                            >
                                                                <Input maxLength={200} />
                                                            </Form.Item>
                                                            <Form.Item
                                                                label="IOS Scheme链接"
                                                                name={[ 'extendConfig', 'iosPackageName' ]}
                                                                required
                                                                rules={[ { required: true, message: '请输入' } ]}
                                                                wrapperCol={{ span: 7 }}
                                                            >
                                                                <Input maxLength={200} />
                                                            </Form.Item>{' '}
                                                        </>
                                                    ) : null}
                                                </>
                                            );
                                        } else {
                                            return null;
                                        }
                                    }}
                                </Form.Item>
                            </>
                        );
                    } else {
                        return null;
                    }
                }}
            </Form.Item>

            <Form.Item
                noStyle
                required
                shouldUpdate={(prev, next) =>
                    prev.extendConfig?.cdkEnable !== next.extendConfig?.cdkEnable || prev.games !== next.games
                }
            >
                {({ getFieldValue }) => {
                    const cdkEnable = getFieldValue([ 'extendConfig', 'cdkEnable' ]);
                    return cdkEnable ? (
                        <Form.Item
                            label="展示兑换码"
                            name={[ 'extendConfig', 'cdks' ]}
                            required
                            rules={[ { required: true, message: '请输入' } ]}
                            wrapperCol={{ span: 7 }}
                        >
                            <Select
                                options={cdkList}
                                mode="multiple"
                                allowClear
                                showSearch
                                optionFilterProp="label"
                                maxTagCount={5}
                                filterOption={(input: any, option: any) => {
                                    const str = String(input).toLowerCase();
                                    const splitStr = str.split(',');
                                    const label = String(option?.label ?? '').toLowerCase();
                                    const valStr = String(option?.value ?? '');
                                    const idStr = valStr.split('&')[0];
                                    return (
                                        label.includes(str) ||
                                        valStr.includes(str) ||
                                        idStr.includes(str) ||
                                        splitStr.includes(valStr) ||
                                        splitStr.includes(idStr)
                                    );
                                }}
                                searchValue={cdkSearchValue}
                                onSearch={val => setCdkSearchValue(val)}
                                onChange={() => setCdkSearchValue('')}
                                onKeyDown={e => {
                                    if ((e as any).key === 'Enter') {
                                        (e as any).preventDefault();
                                        if (cdkSearchValue) {
                                            handleFillCdk();
                                        }
                                    }
                                }}
                                placeholder="多个兑换码/ID 用逗号分隔，可回车回填"
                            />
                        </Form.Item>
                    ) : null;
                }}
            </Form.Item>
            <Form.Item label="附加功能" required className="mb-0">
                <div className="flex-items-center">
                    <Form.Item name="quickCommentEnable">
                        <CheckBoxNumber>快捷评论</CheckBoxNumber>
                    </Form.Item>
                    <Form.Item name="translateEnable">
                        <CheckBoxNumber>贴文翻译</CheckBoxNumber>
                    </Form.Item>
                </div>
            </Form.Item>
            <Form.Item shouldUpdate={(prev, next) => prev.publicityVisible !== next.publicityVisible} noStyle>
                {({ getFieldValue }) => {
                    const publicityVisible = getFieldValue('publicityVisible');
                    return publicityVisible === PUBLICITYVISIBILE.Open ? (
                        <>
                            <Form.Item
                                name="publicityLabel"
                                label="品宣名称"
                                required
                                wrapperCol={{ span: 7 }}
                                normalize={val => val?.trim()}
                            >
                                <Input maxLength={MAX_PUBLICITYLABEL_LEN} />
                            </Form.Item>
                            <Form.Item name="publicityIcon" label="自定义ICON" extra="建议 128*128,png、jpg格式">
                                <UploadImg
                                    imageOrigin=""
                                    uploadOption={ClubUploadOption}
                                    maxSize={10 * 1024 * 1024}
                                    accept="image/png,image/jpg,image/jpeg,image/gif"
                                    isRandomFileName={true}
                                />
                            </Form.Item>
                        </>
                    ) : null;
                }}
            </Form.Item>
            <Form.Item name="toolMode" label="功能栏" required valuePropName="checked">
                <Switch
                    checkedChildren="开启"
                    unCheckedChildren="关闭"
                    onChange={val => {
                        if (val && !modalForm.getFieldValue('toolbar')?.length) {
                            if (isEN) {
                                setToolActiveKey('en-US');
                                setToolSelectedLanguages([ 'en-US' ]);
                            }
                            modalForm.setFieldsValue({
                                toolbar: [
                                    {
                                        name: '',
                                        icon: '',
                                        url: '',
                                        isLogin: 0,
                                        ...(isEN
                                            ? {
                                                  multiLang: {
                                                      'en-US': '',
                                                  },
                                              }
                                            : {}),
                                    },
                                ],
                            });
                        }
                        // 关闭
                        if (!val && isEN) {
                            setToolActiveKey('');
                            setToolSelectedLanguages([]);
                            modalForm.setFieldsValue({
                                toolbar: [],
                            });
                        }
                    }}
                />
            </Form.Item>
            <LanguageTabWrapper
                modalForm={modalForm}
                selectedLanguages={toolSelectedLanguages}
                setSelectedLanguages={setToolSelectedLanguages}
                activeKey={toolActiveKey}
                setActiveKey={setToolActiveKey}
            >
                {lang => (
                    <>
                        <Form.Item shouldUpdate={(prev, next) => prev.toolMode !== next.toolMode} noStyle>
                            {({ getFieldValue }) => {
                                const toolMode = getFieldValue('toolMode');
                                return (
                                    <Form.Item
                                        wrapperCol={{ offset: 3 }}
                                        style={{ display: !toolMode ? 'none' : 'block' }}
                                    >
                                        <Form.List name="toolbar">
                                            {(fields, { add, remove }) => {
                                                fields = fields.map((filed, index) => ({
                                                    ...filed,
                                                    expandRowSpan: index === 0 ? fields.length : 0,
                                                }));
                                                return (
                                                    <SortableTable
                                                        helperClass="row-dragging-club__board"
                                                        onChangeSort={onChangeSort}
                                                        dataSource={fields}
                                                        className="form-list"
                                                        columns={[
                                                            {
                                                                key: 'index',
                                                                title: '序号',
                                                                align: 'center',
                                                                width: 40,
                                                                render: (field, record, index) => {
                                                                    return index + 1;
                                                                },
                                                            },
                                                            {
                                                                key: 'icon',
                                                                title: '图标',
                                                                align: 'center',
                                                                width: 70,
                                                                render: field => {
                                                                    return (
                                                                        <div className="upload-item">
                                                                            <Form.Item
                                                                                name={[ field?.name, 'icon' ]}
                                                                                fieldKey={[ field?.fieldKey, 'icon' ]}
                                                                                rules={normalRuleValidator(
                                                                                    '请上传',
                                                                                    !!toolMode
                                                                                )}
                                                                            >
                                                                                <UploadImg
                                                                                    uploadButton={
                                                                                        <Tooltip title="建议：尺寸80*80，png/jpg格式，内存500kb以内">
                                                                                            <PlusOutlined />
                                                                                        </Tooltip>
                                                                                    }
                                                                                    uploadOption={ClubUploadOption}
                                                                                    maxSize={512 * 1024}
                                                                                    sizeType="small"
                                                                                    accept="image/png,image/jpeg"
                                                                                    isRandomFileName={true}
                                                                                />
                                                                            </Form.Item>
                                                                        </div>
                                                                    );
                                                                },
                                                            },
                                                            {
                                                                key: 'name',
                                                                title: '类别名称',
                                                                align: 'center',
                                                                width: 140,
                                                                render: field => {
                                                                    return (
                                                                        <Form.Item
                                                                            name={
                                                                                isEN
                                                                                    ? [
                                                                                          field?.name,
                                                                                          'multiLang',
                                                                                          lang,
                                                                                          'name',
                                                                                      ]
                                                                                    : [ field?.name, 'name' ]
                                                                            }
                                                                            fieldKey={
                                                                                isEN
                                                                                    ? [
                                                                                          field?.fieldKey,
                                                                                          'multiLang',
                                                                                          lang,
                                                                                          'name',
                                                                                      ]
                                                                                    : [ field?.fieldKey, 'name' ]
                                                                            }
                                                                            rules={nameRepeatValidate(
                                                                                'toolbar',
                                                                                field.name,
                                                                                !!toolMode
                                                                            )}
                                                                            normalize={val => val?.trim()}
                                                                        >
                                                                            <Input
                                                                                maxLength={SECTION_NAME_LENGTH_MAX}
                                                                                allowClear
                                                                            />
                                                                        </Form.Item>
                                                                    );
                                                                },
                                                            },
                                                            {
                                                                key: 'url',
                                                                title: clubUrlDemo?.urlDemo ? (
                                                                    <Popover
                                                                        content={
                                                                            <div
                                                                                style={{
                                                                                    maxWidth: '300px',
                                                                                    whiteSpace: 'pre-line',
                                                                                }}
                                                                            >
                                                                                <div
                                                                                    dangerouslySetInnerHTML={{
                                                                                        __html: `<pre>${clubUrlDemo?.params}</pre>`,
                                                                                    }}
                                                                                ></div>
                                                                                <p>例：{clubUrlDemo?.urlDemo}</p>
                                                                            </div>
                                                                        }
                                                                    >
                                                                        <span>链接地址</span> <InfoCircleOutlined />
                                                                    </Popover>
                                                                ) : (
                                                                    '链接地址'
                                                                ),
                                                                align: 'center',
                                                                width: 200,
                                                                render: field => {
                                                                    return (
                                                                        <Form.Item
                                                                            name={[ field?.name, 'url' ]}
                                                                            fieldKey={[ field?.fieldKey, 'url' ]}
                                                                            rules={normalRuleValidator(
                                                                                '请输入',
                                                                                !!toolMode
                                                                            )}
                                                                            normalize={val => val?.trim()}
                                                                        >
                                                                            <Input
                                                                                maxLength={URL_LENGTH_MAX}
                                                                                allowClear
                                                                            />
                                                                        </Form.Item>
                                                                    );
                                                                },
                                                            },
                                                            {
                                                                key: 'isLogin',
                                                                title: '是否登录',
                                                                width: 70,
                                                                align: 'center',
                                                                render: field => {
                                                                    return (
                                                                        <Form.Item
                                                                            name={[ field?.name, 'isLogin' ]}
                                                                            fieldKey={[ field?.fieldKey, 'isLogin' ]}
                                                                        >
                                                                            <NumberSwitch
                                                                                checkedChildren="开启"
                                                                                unCheckedChildren="关闭"
                                                                            />
                                                                        </Form.Item>
                                                                    );
                                                                },
                                                            },
                                                            ...(getStorageSync().expanded
                                                                ? ([
                                                                      {
                                                                          key: 'notificationMember',
                                                                          title: (
                                                                              <Popover
                                                                                  content={
                                                                                      <p>
                                                                                          勾选则会拉取会员中心的对应地址的红点提示。注：非会员中心的网址不会生效
                                                                                      </p>
                                                                                  }
                                                                              >
                                                                                  <span>会员中心通知</span>{' '}
                                                                                  <QuestionCircleOutlined />
                                                                              </Popover>
                                                                          ),
                                                                          align: 'center',
                                                                          width: 50,
                                                                          render: (field: any) => {
                                                                              return (
                                                                                  <Form.Item
                                                                                      name={[
                                                                                          field?.name,
                                                                                          'notificationMember',
                                                                                      ]}
                                                                                      fieldKey={[
                                                                                          field?.fieldKey,
                                                                                          'notificationMember',
                                                                                      ]}
                                                                                      valuePropName="checked"
                                                                                  >
                                                                                      <Checkbox></Checkbox>
                                                                                  </Form.Item>
                                                                              );
                                                                          },
                                                                      },
                                                                      {
                                                                          key: 'channel',
                                                                          title: (
                                                                              <Popover
                                                                                  content={
                                                                                      <p>注：所选的渠道隐藏该功能项</p>
                                                                                  }
                                                                              >
                                                                                  <span>渠道限制</span>{' '}
                                                                                  <QuestionCircleOutlined />
                                                                              </Popover>
                                                                          ),
                                                                          align: 'center',
                                                                          width: 110,
                                                                          render: (field: any) => {
                                                                              return (
                                                                                  <Form.Item
                                                                                      shouldUpdate={(prev, next) =>
                                                                                          prev.games !== next.games
                                                                                      }
                                                                                      noStyle
                                                                                  >
                                                                                      {({ getFieldValue }) => {
                                                                                          const gameVersions = getFieldValue(
                                                                                              'games'
                                                                                          );
                                                                                          let gameVersionsData = gameVersions.map(
                                                                                              (item: string) => {
                                                                                                  let temp = item.split(
                                                                                                      SEPARATE
                                                                                                  );
                                                                                                  return temp[1];
                                                                                              }
                                                                                          );
                                                                                          const channelData = channelList.filter(
                                                                                              item => {
                                                                                                  return gameVersionsData.includes(
                                                                                                      item.gameVersion
                                                                                                  );
                                                                                              }
                                                                                          );
                                                                                          return (
                                                                                              <Form.Item
                                                                                                  name={[
                                                                                                      field?.name,
                                                                                                      'channelIds',
                                                                                                  ]}
                                                                                                  fieldKey={[
                                                                                                      field?.fieldKey,
                                                                                                      'channelIds',
                                                                                                  ]}
                                                                                              >
                                                                                                  <ChannelFormItem
                                                                                                      form={modalForm}
                                                                                                      gameVersions={
                                                                                                          gameVersionsData
                                                                                                      }
                                                                                                      channelData={
                                                                                                          channelData
                                                                                                      }
                                                                                                  />
                                                                                              </Form.Item>
                                                                                          );
                                                                                      }}
                                                                                  </Form.Item>
                                                                              );
                                                                          },
                                                                      },
                                                                      {
                                                                          key: 'whiteListUsers',
                                                                          title: (
                                                                              <Popover
                                                                                  content={
                                                                                      <p>
                                                                                          注：可为功能项配置白名单用户标签
                                                                                      </p>
                                                                                  }
                                                                              >
                                                                                  <span>白名单用户</span>{' '}
                                                                                  <QuestionCircleOutlined />
                                                                              </Popover>
                                                                          ),
                                                                          align: 'center',
                                                                          width: 110,
                                                                          render: (field: any) => {
                                                                              return (
                                                                                  <Form.Item
                                                                                      name={[
                                                                                          field?.name,
                                                                                          'whitelistUserTags',
                                                                                      ]}
                                                                                      fieldKey={[
                                                                                          field?.fieldKey,
                                                                                          'whitelistUserTags',
                                                                                      ]}
                                                                                  >
                                                                                      <TagSettingFormItem
                                                                                          form={modalForm}
                                                                                          boardId={data?.id}
                                                                                          clubDeployVersion={
                                                                                              data?.clubDeployVersion
                                                                                          }
                                                                                          tagSettingList={
                                                                                              tagSettingList
                                                                                          }
                                                                                          loading={tagSettingLoading}
                                                                                      />
                                                                                  </Form.Item>
                                                                              );
                                                                          },
                                                                      },
                                                                  ] as any)
                                                                : []),
                                                            {
                                                                key: 'expanded',
                                                                title: '拓展',
                                                                align: 'center',
                                                                render: (v: string, row: any) => {
                                                                    return {
                                                                        children: getStorageSync().expanded ? (
                                                                            <DoubleLeftOutlined
                                                                                style={{ cursor: 'pointer' }}
                                                                                onClick={() => handleExpanded(false)}
                                                                            />
                                                                        ) : (
                                                                            <DoubleRightOutlined
                                                                                style={{ cursor: 'pointer' }}
                                                                                onClick={() => handleExpanded(true)}
                                                                            />
                                                                        ),
                                                                        props: {
                                                                            rowSpan: row.expandRowSpan,
                                                                        },
                                                                    };
                                                                },
                                                            },
                                                            {
                                                                key: 'operation',
                                                                title: '操作',
                                                                align: 'center',
                                                                width: 50,
                                                                render: field => {
                                                                    return fields?.length > 1 ? (
                                                                        <MinusCircleOutlined
                                                                            style={{ color: 'red' }}
                                                                            onClick={() => {
                                                                                remove(field?.fieldKey);
                                                                            }}
                                                                        />
                                                                    ) : (
                                                                        ''
                                                                    );
                                                                },
                                                            },
                                                        ]}
                                                        pagination={false}
                                                        size="small"
                                                        footer={() => {
                                                            return fields?.length < SECTION_LENGTH_MAX ? (
                                                                <Button
                                                                    style={{ marginTop: '8px' }}
                                                                    block
                                                                    onClick={() => {
                                                                        add({
                                                                            name: '',
                                                                            icon: '',
                                                                            url: '',
                                                                        });
                                                                    }}
                                                                    icon={<PlusCircleOutlined />}
                                                                >
                                                                    添加功能
                                                                </Button>
                                                            ) : null;
                                                        }}
                                                    />
                                                );
                                            }}
                                        </Form.List>
                                    </Form.Item>
                                );
                            }}
                        </Form.Item>
                    </>
                )}
            </LanguageTabWrapper>
            {isEN ? (
                <Form.Item label="资讯类别" name={[ 'extendConfig', 'sectionType' ]}>
                    <Radio.Group
                        options={SectionTypeOptions}
                        onChange={e => {
                            const nextSectionType = e.target.value;
                            setSectionType(nextSectionType);

                            if (!isEN) {
                                return;
                            }

                            if (nextSectionType === SECTION_TYPE.Basic) {
                                const currentSectionsByLang = modalForm.getFieldValue('sectionsByLang') || {};
                                const fallbackLang = currentSectionsByLang['en-US']
                                    ? 'en-US'
                                    : sectionSelectedLanguages.find(lang => currentSectionsByLang[lang]?.length) ||
                                      sectionSelectedLanguages[0] ||
                                      'en-US';
                                const basicSections = toBasicSectionsFromIndependent(
                                    currentSectionsByLang[fallbackLang] || [],
                                    fallbackLang
                                );
                                modalForm.setFields([
                                    {
                                        name: 'sections',
                                        value: basicSections,
                                    },
                                ]);
                                return;
                            }

                            if (nextSectionType !== SECTION_TYPE.Independent) {
                                return;
                            }

                            const currentSectionsByLang = modalForm.getFieldValue('sectionsByLang') || {};
                            const nextSectionsByLang = getIndependentSectionsByLang(
                                currentSectionsByLang,
                                sectionSelectedLanguages
                            );

                            modalForm.setFields([
                                {
                                    name: 'sectionsByLang',
                                    value: nextSectionsByLang,
                                },
                            ]);

                            if (!sectionSelectedLanguages.includes(sectionActiveKey)) {
                                setSectionActiveKey(sectionSelectedLanguages[0] || '');
                            }
                        }}
                        disabled={!isCreate}
                    />
                </Form.Item>
            ) : null}
            <Form.Item
                noStyle
                shouldUpdate={(prev, next) =>
                    get(prev, [ 'extendConfig', 'sectionType' ]) !== get(next, [ 'extendConfig', 'sectionType' ])
                }
            >
                {({ getFieldValue }) => {
                    const currentSectionType = getFieldValue([ 'extendConfig', 'sectionType' ]) ?? SECTION_TYPE.Basic;
                    if (currentSectionType === SECTION_TYPE.Basic) {
                        return (
                            <LanguageTabWrapper
                                modalForm={modalForm}
                                selectedLanguages={sectionSelectedLanguages}
                                setSelectedLanguages={setSectionSelectedLanguages}
                                activeKey={sectionActiveKey}
                                setActiveKey={setSectionActiveKey}
                            >
                                {lang => (
                                    <Form.Item label="资讯栏目" required>
                                        <Form.List name="sections">
                                            {(fields, { add, remove, move }) => {
                                                return (
                                                    <SecetionItem
                                                        {...otherProps}
                                                        form={modalForm}
                                                        isCreate={isCreate}
                                                        fields={fields}
                                                        add={add}
                                                        remove={remove}
                                                        move={move}
                                                        ClubUploadOption={ClubUploadOption}
                                                        lang={lang}
                                                    />
                                                );
                                            }}
                                        </Form.List>
                                    </Form.Item>
                                )}
                            </LanguageTabWrapper>
                        );
                    } else {
                        return (
                            <LanguageTabWrapper
                                modalForm={modalForm}
                                selectedLanguages={sectionSelectedLanguages}
                                setSelectedLanguages={setSectionSelectedLanguages}
                                activeKey={sectionActiveKey}
                                setActiveKey={setSectionActiveKey}
                                afterAddLanguage={newLang => {
                                    const currentSectionsByLang = modalForm.getFieldValue('sectionsByLang') || {};
                                    if (currentSectionsByLang[newLang]) {
                                        return;
                                    }
                                    const nextLangSort = sectionSelectedLanguages.length + 1;
                                    modalForm.setFields([
                                        {
                                            name: 'sectionsByLang',
                                            value: {
                                                ...currentSectionsByLang,
                                                [newLang]: createIndependentSectionDefaults(newLang, nextLangSort),
                                            },
                                        },
                                    ]);
                                }}
                            >
                                {lang => (
                                    <Form.Item label="资讯栏目" required>
                                        <Form.Item
                                            noStyle
                                            shouldUpdate={(prev, next) =>
                                                !isEqual(
                                                    get(prev, [ 'sectionsByLang', lang ]),
                                                    get(next, [ 'sectionsByLang', lang ])
                                                )
                                            }
                                        >
                                            {() => (
                                                <Form.List name={[ 'sectionsByLang', lang ]}>
                                                    {(fields, { add, remove, move }) => {
                                                        return (
                                                            <SecetionItem
                                                                {...otherProps}
                                                                form={modalForm}
                                                                isCreate={isCreate}
                                                                fields={fields}
                                                                add={add}
                                                                remove={remove}
                                                                move={move}
                                                                ClubUploadOption={ClubUploadOption}
                                                                lang={lang}
                                                                rootName={[ 'sectionsByLang', lang ]}
                                                                isIndependent
                                                            />
                                                        );
                                                    }}
                                                </Form.List>
                                            )}
                                        </Form.Item>
                                    </Form.Item>
                                )}
                            </LanguageTabWrapper>
                        );
                    }
                }}
            </Form.Item>
        </div>
    );
};

interface TagSettingFormItemProps {
    value?: Array<number>;
    onChange?: (v: Array<number>) => void;
    boardId?: number | string;
    clubDeployVersion?: CLUB_DEPLOY_VERSION;
    form: FormInstance;
    tagSettingList: TagSettingListItem[];
    loading?: boolean;
}

function TagSettingFormItem(props: TagSettingFormItemProps) {
    const { value, boardId, clubDeployVersion, form, tagSettingList, loading } = props;
    const onChange = props.onChange!;

    const [ visible, setVisible ] = useState(false);
    const [ selectedTag, setSelectedTag ] = useState<{
        tagIds: Array<number>;
        tagOptions: Array<{
            label: string;
            value: number;
        }>;
    }>({
        tagIds: [],
        tagOptions: [],
    });

    const tagSelectOptions = useMemo(() => {
        return (tagSettingList ?? []).map(item => ({
            label: `${item.name}(${item.id})`,
            value: item.id,
        }));
    }, [ tagSettingList ]);

    const tagSettingDict = useMemo(() => {
        return keyBy(tagSettingList, item => item.id);
    }, [ tagSettingList ]);

    useEffect(() => {
        const nextValue = isArray(value) ? value : [];
        const tagOptions = nextValue.map((item: number) => {
            const tagItem = tagSettingDict[item];
            const label = tagItem ? `${tagItem.name}(${tagItem.id})` : `${item}`;
            return {
                label,
                value: item,
            };
        });
        setSelectedTag({
            tagIds: nextValue,
            tagOptions,
        });
    }, [ tagSettingDict, value ]);

    const handleChange = useCallback((val: Array<number>, options) => {
        if (val.length > 50) {
            message.error('最多选择50个标签');
            return;
        }
        setSelectedTag({
            tagIds: val,
            tagOptions: options,
        });
    }, []);

    const handleConfirm = useCallback(() => {
        onChange && onChange(selectedTag.tagIds);
        setVisible(false);
    }, [ onChange, selectedTag.tagIds ]);

    const handleOpen = useCallback(() => {
        if (!boardId) {
            message.error('请先创建并保存版块');
            return;
        }
        if (!clubDeployVersion) {
            message.error('请先选择数据中心');
            form.validateFields([ 'clubDeployVersion' ]);
            return;
        }
        setVisible(true);
    }, [ boardId, clubDeployVersion, form ]);

    const selectedLength = selectedTag.tagIds?.length || 0;

    return (
        <div>
            <Space>
                {isArray(value) && value.length > 0 ? (
                    <Popover
                        content={
                            <div>
                                {value.map(tagId => {
                                    const tag = tagSettingDict[tagId];
                                    return <Tag key={tagId}>{`${tag?.name || tagId}(${tagId})`}</Tag>;
                                })}
                            </div>
                        }
                        trigger="hover"
                    >
                        <Tag color="blue">{`${selectedLength}个`}</Tag>
                    </Popover>
                ) : (
                    '暂无'
                )}
                <EditOutlined onClick={handleOpen} />
            </Space>
            <Modal
                width={480}
                title="白名单用户标签"
                visible={visible}
                onCancel={() => setVisible(false)}
                maskClosable={false}
                getContainer={useContentDialogContainer()}
                centered
                footer={
                    <div
                        style={{
                            textAlign: 'right',
                        }}
                    >
                        <Button
                            onClick={() => {
                                setVisible(false);
                            }}
                            style={{ marginRight: 8 }}
                        >
                            取消
                        </Button>
                        <Button
                            onClick={() => {
                                handleConfirm();
                            }}
                            type="primary"
                        >
                            确定
                        </Button>
                    </div>
                }
            >
                <Select
                    style={{ width: '100%', marginBottom: 10 }}
                    maxTagCount={3}
                    allowClear
                    mode="multiple"
                    options={tagSelectOptions}
                    filterOption={(input: any, option: any) =>
                        option?.label?.toLowerCase().includes(input.toLowerCase())
                    }
                    onChange={handleChange}
                    value={selectedTag.tagIds || []}
                    placeholder="请选择白名单用户标签"
                    loading={loading}
                />
                <div>
                    {selectedTag.tagOptions.map(item => {
                        return (
                            <Tag color="blue" key={item.value} style={{ marginBottom: 6 }}>
                                {item.label}
                            </Tag>
                        );
                    })}
                </div>
            </Modal>
        </div>
    );
}

interface ChannelFormItemProps {
    value?: any;
    onChange?: (v: any) => void;
    channelData?: ChannelType[];
    form: FormInstance;
    gameVersions: Array<string>;
}

function ChannelFormItem(props: ChannelFormItemProps) {
    const { value, channelData = [], form, gameVersions } = props;
    const onChange = props.onChange!;

    const channelSelectOptions = useMemo(() => {
        return channelData.map(item => ({
            label: `${item.name}(${item.id})`,
            value: item.id,
        }));
    }, [ channelData ]);

    const channelDataDict = useMemo(() => {
        return keyBy(channelData, item => item.id);
    }, [ channelData ]);

    /** 控制渠道框显示隐藏 */
    const [ visible, setVisible ] = useState(false);
    /** 选中的渠道 */
    const [ selectedChannel, setSelectedChannel ] = useState<{
        channelIds: Array<number>;
        channelOptions: Array<{
            label: string;
            value: number;
        }>;
    }>({
        channelIds: [],
        channelOptions: [],
    });

    useEffect(() => {
        const channelOptions = (value || []).map((item: number) => ({
            label: channelDataDict[item]?.name,
            value,
        }));
        setSelectedChannel({
            channelIds: value,
            channelOptions,
        });
    }, [ channelDataDict, value ]);

    const handleChange = useCallback((value, options) => {
        if (value.length > 50) {
            message.error('最多选择50个渠道');
            return;
        }
        setSelectedChannel({
            channelIds: value,
            channelOptions: options,
        });
    }, []);

    const handleConfirm = useCallback(() => {
        onChange && onChange(selectedChannel.channelIds);
        setVisible(false);
    }, [ onChange, selectedChannel.channelIds ]);

    return (
        <div>
            <Space>
                {isArray(value) && value.length > 0 ? (
                    <Popover
                        content={
                            <div>
                                {value.map(channelId => {
                                    return (
                                        <Tag key={channelId}>{`${channelDataDict[channelId]?.name}(${channelId})`}</Tag>
                                    );
                                })}
                            </div>
                        }
                        trigger="hover"
                    >
                        <Tag color="blue">{`${value.length}个`}</Tag>
                    </Popover>
                ) : (
                    '无'
                )}
                <EditOutlined
                    onClick={() => {
                        if (gameVersions.length === 0) {
                            message.error('请先选择游戏');
                            form.validateFields([ 'games' ]);
                            return;
                        }
                        setVisible(true);
                    }}
                />
            </Space>
            <Modal
                width={480}
                title="渠道限制登录"
                visible={visible}
                onCancel={() => setVisible(false)}
                maskClosable={false}
                getContainer={useContentDialogContainer()}
                centered
                footer={
                    <div
                        style={{
                            textAlign: 'right',
                        }}
                    >
                        <Button
                            onClick={() => {
                                setVisible(false);
                            }}
                            style={{ marginRight: 8 }}
                        >
                            取消
                        </Button>
                        <Button
                            onClick={() => {
                                handleConfirm();
                            }}
                            type="primary"
                        >
                            确定
                        </Button>
                    </div>
                }
            >
                <Select
                    style={{ width: '100%', marginBottom: 10 }}
                    maxTagCount={3}
                    allowClear
                    mode="multiple"
                    options={channelSelectOptions}
                    filterOption={(input: any, option: any) =>
                        option?.label?.toLowerCase().indexOf(input.toLowerCase()) >= 0
                    }
                    onChange={handleChange}
                    value={selectedChannel.channelIds || []}
                    placeholder="请输入要限制的渠道ID"
                ></Select>
                <div>
                    {selectedChannel.channelOptions.map(item => {
                        return (
                            <Tag color="blue" key={item.value} style={{ marginBottom: 6 }}>
                                {`${item.label}(${item.value})`}
                            </Tag>
                        );
                    })}
                </div>
                <p style={{ color: '#bfbfbf' }}>注：所选的渠道隐藏该功能项</p>
            </Modal>
        </div>
    );
}

export default inject('GameContext', 'Game')(observer(BaseForm));
