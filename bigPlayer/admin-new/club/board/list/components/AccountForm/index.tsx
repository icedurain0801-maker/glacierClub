import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Checkbox, Form, Input, Image, Tag, FormInstance, Space, Select } from 'antd';
import { get, keyBy } from 'lodash';
import { inject, observer } from 'mobx-react';
import { CloseOutlined } from '@ant-design/icons';

import NumberSwitch from '@/components/NumberSwitch';
import UploadImg from '@/components/uploadFile/UploadImg';
import GoodsInfoCmp, { ImageOptions } from '@/components/goodsInfo/GoodsInfo';
import { StoreType } from '@/store/config';
import { getGameConfigCenterCompatible } from '@/api/configCenter';

import { BoardEditParams, BindTypeOptions, DownloadTypeOptions, DOWNLOAD_TYPE_ENUM, CLUB_OSS_PREFIX } from '@ts/club';
import {
    GoodIdKeyDictType,
    GOODID_KEY_DICT,
    GoodNameKeyDictType,
    GOODNAME_KEY_DICT,
    GoodsKeyMaxDictType,
    GOODS_KEY_MAX_DICT,
    GOODS_MAX_DEFAULT,
    GOODID_KEY_COMBINATION,
    GoodIdKeyCombitDictType,
    GOODID_VALUE_SEPARATE,
    Attachment,
} from '@ts/email';

import { getClubImageHost, useClubUploadOption } from '../../../hooks/useClubUploadOption';
import { SEPARATE } from '../Create';

require('./index.less');
interface AccountFormProps {
    form: FormInstance;
    data: BoardEditParams;
}

interface AccountFormPropsMobx extends AccountFormProps, Pick<StoreType, 'GoodsInfo'> {}

const LableCol = {
    span: 4,
};

const GOODS_TYPE_OPTIONS = [ { label: '游戏道具', value: 1 } ];

interface RewardGoodsValue {
    id: number;
    name: string;
    type: number;
    image?: string;
    num: number;
}

type RewardGoodsSelectorValue = RewardGoodsValue | (Attachment & { type?: number });

interface RewardGoodsSelectorProps {
    value?: RewardGoodsSelectorValue[];
    onChange?: (value?: RewardGoodsValue[]) => void;
    goodsOptions: any[];
    goodsOptionsLoading: boolean;
    imageOptions: ImageOptions;
}

const isAttachmentValue = (item: RewardGoodsSelectorValue): item is Attachment & { type?: number } => {
    return 'goodsId' in item;
};

const getRewardGoodsId = (item: RewardGoodsSelectorValue) => {
    if (isAttachmentValue(item)) {
        return Number(item.goodsId);
    }
    return Number(item.id);
};

const getRewardGoodsName = (item: RewardGoodsSelectorValue) => {
    if (isAttachmentValue(item)) {
        return item.goodsName;
    }
    return item.name;
};

const getRewardGoodsImage = (item: RewardGoodsSelectorValue) => {
    if (isAttachmentValue(item)) {
        return item.goodsPic;
    }
    return item.image;
};

const getRewardGoodsNum = (item: RewardGoodsSelectorValue) => {
    if (isAttachmentValue(item)) {
        return item.goodsNum;
    }
    return item.num;
};

const getRewardGoodsType = (item?: RewardGoodsSelectorValue) => {
    if (!item) {
        return undefined;
    }
    if (!isAttachmentValue(item) && 'type' in item) {
        return item.type;
    }
    return undefined;
};

const RewardGoodsSelector: React.FC<RewardGoodsSelectorProps> = ({
    value,
    onChange,
    goodsOptions,
    goodsOptionsLoading,
    imageOptions,
}) => {
    const rewardValue = useMemo(() => value ?? [], [ value ]);
    const initialType = getRewardGoodsType(rewardValue?.[0]) ?? GOODS_TYPE_OPTIONS[0].value;
    const [ goodsType, setGoodsType ] = useState<number>(initialType);

    useEffect(() => {
        const currentType = getRewardGoodsType(rewardValue?.[0]);
        if (currentType && currentType !== goodsType) {
            setGoodsType(currentType);
        }
    }, [ rewardValue, goodsType ]);

    const goodsInfoValue = useMemo(() => {
        return rewardValue?.map(item => ({
            goodsId: getRewardGoodsId(item),
            goodsName: getRewardGoodsName(item),
            goodsPic: getRewardGoodsImage(item),
            goodsNum: getRewardGoodsNum(item),
        }));
    }, [ rewardValue ]);

    const emitChange = useCallback(
        (list?: Attachment[]) => {
            const nextValue =
                list?.map(item => ({
                    id: item.goodsId,
                    name: item.goodsName,
                    image: item.goodsPic,
                    num: item.goodsNum,
                    type: goodsType,
                })) ?? [];
            onChange?.(nextValue);
        },
        [ goodsType, onChange ]
    );

    const handleRemoveGoods = useCallback(
        (list: Attachment[] = [], goodsId: number) => {
            emitChange(list.filter(item => item.goodsId !== goodsId));
        },
        [ emitChange ]
    );

    const handleTypeChange = useCallback(
        (type: number) => {
            setGoodsType(type);
            if (rewardValue?.length) {
                onChange?.(
                    rewardValue.map(item => ({
                        id: getRewardGoodsId(item),
                        name: getRewardGoodsName(item),
                        image: getRewardGoodsImage(item),
                        num: getRewardGoodsNum(item),
                        type,
                    }))
                );
            }
        },
        [ onChange, rewardValue ]
    );

    return (
        <Space align="start">
            <Select style={{ width: 120 }} value={goodsType} options={GOODS_TYPE_OPTIONS} onChange={handleTypeChange} />
            <GoodsInfoCmp
                value={goodsInfoValue}
                onChange={emitChange}
                maxGoodsLength={5}
                goodsOptions={goodsOptions}
                unGetPopupContainer
                goodsOptionsLoading={goodsOptionsLoading}
                imageOptions={imageOptions}
                custormValueRender={goodsValue => {
                    return (
                        <div className="club-account-goods">
                            {goodsValue?.map((item, index) => {
                                const text = `${item.goodsName} * ${item.goodsNum}`;
                                return (
                                    <div className="goods-item" key={index}>
                                        <div className="goods-img">
                                            {item.goodsPic ? (
                                                <Image width={60} height={60} src={item.goodsPic}></Image>
                                            ) : (
                                                <div className="empty-pic-box">暂无图片</div>
                                            )}
                                            <CloseOutlined
                                                className="close-btn"
                                                onClick={() => handleRemoveGoods(goodsValue || [], item.goodsId)}
                                            />
                                        </div>
                                        <Tag color="blue" style={{ marginTop: 10 }}>
                                            {text}
                                        </Tag>
                                    </div>
                                );
                            })}
                        </div>
                    );
                }}
            />
        </Space>
    );
};

interface GoodsInfoAutoFetcherProps {
    actorBindEnable?: number;
    selectedGame?: string;
    fetchGoodsInfo: (options: { gameId: number; gameVersion: string }) => void;
    resetGoodsInfoParams: () => void;
}

const GoodsInfoAutoFetcher: React.FC<GoodsInfoAutoFetcherProps> = ({
    actorBindEnable,
    selectedGame,
    fetchGoodsInfo,
    resetGoodsInfoParams,
}) => {
    useEffect(() => {
        if (!actorBindEnable) {
            resetGoodsInfoParams();
            return;
        }
        if (!selectedGame) {
            resetGoodsInfoParams();
            return;
        }
        const gameInfo = selectedGame.split(SEPARATE);
        const gameId = Number(gameInfo[0]);
        const gameVersion = gameInfo[1];
        if (!gameId || !gameVersion) {
            return;
        }
        fetchGoodsInfo({
            gameId,
            gameVersion,
        });
    }, [ actorBindEnable, selectedGame, fetchGoodsInfo, resetGoodsInfoParams ]);
    return null;
};

function AccountForm(props: AccountFormProps) {
    const { data } = props as AccountFormPropsMobx;

    const ClubUploadOption = useClubUploadOption({ clubDeployVersion: data.clubDeployVersion || '' });

    const [ loading, setLoading ] = useState(false);
    const [ goodsInfo, setGoodsInfo ] = useState<any[]>([]);
    const lastGoodsInfoParamsRef = useRef<{ gameId: number; gameVersion: string } | null>(null);
    const resetGoodsInfoParams = useCallback(() => {
        lastGoodsInfoParamsRef.current = null;
    }, []);

    const goodsInfoDict = useMemo(() => {
        return keyBy(goodsInfo, 'id');
    }, [ goodsInfo ]);

    const getGoodsInfo = useCallback(async (options: { gameId: number; gameVersion: string }) => {
        if (
            lastGoodsInfoParamsRef.current &&
            lastGoodsInfoParamsRef.current.gameId === options.gameId &&
            lastGoodsInfoParamsRef.current.gameVersion === options.gameVersion
        ) {
            return;
        }
        lastGoodsInfoParamsRef.current = { ...options };
        setLoading(true);
        try {
            const ret = await getGameConfigCenterCompatible({
                gameId: options.gameId,
                gameVersion: options.gameVersion,
                tableName: 'GoodsInfo',
            });
            const data = ret.data || [];
            const { gameId } = options;
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
            setGoodsInfo(transformData || []);
        } finally {
            setLoading(false);
        }
    }, []);

    return (
        <>
            <Form.Item
                name={[ 'extendConfig', 'phoneBindEnable' ]}
                label="登录账号强制绑定手机号"
                labelCol={LableCol}
                required
            >
                <NumberSwitch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>
            <Form.Item
                noStyle
                shouldUpdate={(prev, next) =>
                    prev.games !== next.games ||
                    get(prev, [ 'extendConfig', 'actorBindEnable' ]) !== get(next, [ 'extendConfig', 'actorBindEnable' ])
                }
            >
                {({ getFieldValue }) => (
                    <GoodsInfoAutoFetcher
                        actorBindEnable={getFieldValue([ 'extendConfig', 'actorBindEnable' ])}
                        selectedGame={(getFieldValue([ 'games' ]) || [])[0]}
                        fetchGoodsInfo={getGoodsInfo}
                        resetGoodsInfoParams={resetGoodsInfoParams}
                    />
                )}
            </Form.Item>
            <Form.Item name={[ 'extendConfig', 'actorBindEnable' ]} label="角色绑定" labelCol={LableCol} required>
                <NumberSwitch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>
            <Form.Item
                noStyle
                shouldUpdate={(prev, next) =>
                    get(prev, [ 'extendConfig', 'actorBindEnable' ]) !== get(next, [ 'extendConfig', 'actorBindEnable' ])
                }
            >
                {({ getFieldValue }) => {
                    const actorBindEnable = getFieldValue([ 'extendConfig', 'actorBindEnable' ]);
                    if (!actorBindEnable) {
                        return null;
                    } else {
                        return (
                            <>
                                <Form.Item
                                    name={[ 'extendConfig', 'actorBindTypes' ]}
                                    label="绑定方式"
                                    labelCol={LableCol}
                                    rules={[ { required: true, message: '请选择绑定方式' } ]}
                                >
                                    <Checkbox.Group options={BindTypeOptions} />
                                </Form.Item>
                                <Form.Item
                                    name={[ 'extendConfig', 'actorDefaultFace' ]}
                                    label="默认头像"
                                    extra="建议200*200，png、jpg格式"
                                    labelCol={LableCol}
                                    required
                                    rules={[ { required: true, message: '请选择' } ]}
                                >
                                    <UploadImg
                                        imageOrigin=""
                                        uploadOption={ClubUploadOption}
                                        maxSize={10 * 1024 * 1024}
                                        accept="image/png,image/jpeg"
                                        isRandomFileName={true}
                                    />
                                </Form.Item>
                            </>
                        );
                    }
                }}
            </Form.Item>
            <Form.Item
                noStyle
                shouldUpdate={(prev, next) =>
                    prev.games !== next.games || prev.clubDeployVersion !== next.clubDeployVersion
                }
            >
                {({ getFieldValue }) => {
                    const games = getFieldValue([ 'games' ]);
                    const clubDeployVersion = getFieldValue('clubDeployVersion') || '';
                    const selectedGame = games ? games[0] : undefined;

                    if (!selectedGame) {
                        return null;
                    } else {
                        const gameInfo = selectedGame.split(SEPARATE);
                        return (
                            <>
                                <Form.Item
                                    name={[ 'extendConfig', 'actorBindRewardEnable' ]}
                                    label="角色绑定奖励"
                                    labelCol={LableCol}
                                    required
                                >
                                    <NumberSwitch checkedChildren="开启" unCheckedChildren="关闭" />
                                </Form.Item>
                                <Form.Item
                                    noStyle
                                    shouldUpdate={(prev, next) =>
                                        prev.extendConfig?.actorBindRewardEnable !==
                                        next.extendConfig?.actorBindRewardEnable
                                    }
                                >
                                    {({ getFieldValue }) => {
                                        const actorBindRewardEnable = getFieldValue([
                                            'extendConfig',
                                            'actorBindRewardEnable',
                                        ]);
                                        if (!actorBindRewardEnable) {
                                            return null;
                                        } else {
                                            return (
                                                <>
                                                    <Form.Item
                                                        name={[ 'extendConfig', 'goods' ]}
                                                        label="奖励"
                                                        labelCol={LableCol}
                                                        required
                                                        rules={[ { required: true, message: '请选择奖励' } ]}
                                                    >
                                                        <RewardGoodsSelector
                                                            goodsOptions={goodsInfo}
                                                            goodsOptionsLoading={loading}
                                                            imageOptions={{
                                                                _host: getClubImageHost(clubDeployVersion),
                                                                gameId: Number(gameInfo[0]),
                                                                gameVersion: gameInfo[1],
                                                                goodsInfoDict: goodsInfoDict,
                                                                urlPrefix: CLUB_OSS_PREFIX,
                                                            }}
                                                        />
                                                    </Form.Item>
                                                </>
                                            );
                                        }
                                    }}
                                </Form.Item>
                            </>
                        );
                    }
                }}
            </Form.Item>

            <Form.Item
                name={[ 'extendConfig', 'clubDownloadEnable' ]}
                label="推荐下载大玩家APP"
                labelCol={LableCol}
                required
            >
                <NumberSwitch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>
            <Form.Item
                shouldUpdate={(prev, next) =>
                    prev.extendConfig?.clubDownloadEnable !== next.extendConfig?.clubDownloadEnable
                }
                noStyle
            >
                {({ getFieldValue }) => {
                    const downloadEnable = getFieldValue([ 'extendConfig', 'clubDownloadEnable' ]);
                    if (downloadEnable) {
                        return (
                            <>
                                <Form.Item
                                    label="下载方式选择"
                                    name={[ 'extendConfig', 'clubDownloadTypes' ]}
                                    labelCol={LableCol}
                                    required
                                    rules={[ { required: true, message: '至少选择1个下载方式' } ]}
                                >
                                    <Checkbox.Group options={DownloadTypeOptions} />
                                </Form.Item>{' '}
                                <Form.Item
                                    shouldUpdate={(prev, next) =>
                                        prev.extendConfig?.clubDownloadTypes !== next.extendConfig?.clubDownloadTypes
                                    }
                                    noStyle
                                >
                                    {({ getFieldValue }) => {
                                        const gameDownloadTypes = getFieldValue([ 'extendConfig', 'clubDownloadTypes' ]);
                                        if (gameDownloadTypes?.length) {
                                            return (
                                                <>
                                                    {gameDownloadTypes.includes(DOWNLOAD_TYPE_ENUM.Android) ? (
                                                        <>
                                                            <Form.Item
                                                                name={[ 'extendConfig', 'clubAndroidIcon' ]}
                                                                label="Andrioid图标"
                                                                extra="建议200*200，png、jpg格式"
                                                                labelCol={LableCol}
                                                                required
                                                                rules={[ { required: true, message: '请上传图标' } ]}
                                                            >
                                                                <UploadImg
                                                                    imageOrigin=""
                                                                    uploadOption={ClubUploadOption}
                                                                    maxSize={10 * 1024 * 1024}
                                                                    accept="image/png,image/jpeg"
                                                                    isRandomFileName={true}
                                                                />
                                                            </Form.Item>
                                                            <Form.Item
                                                                label="Android商店地址"
                                                                name={[ 'extendConfig', 'clubAndroidDownloadLink' ]}
                                                                required
                                                                rules={[ { required: true, message: '请输入' } ]}
                                                                labelCol={LableCol}
                                                            >
                                                                <Input
                                                                    maxLength={200}
                                                                    allowClear
                                                                    className="q1-form-item-xxxl"
                                                                />
                                                            </Form.Item>
                                                            <Form.Item
                                                                label="Android Scheme链接"
                                                                name={[ 'extendConfig', 'clubAndroidPackageName' ]}
                                                                required
                                                                rules={[ { required: true, message: '请输入' } ]}
                                                                labelCol={LableCol}
                                                            >
                                                                <Input
                                                                    maxLength={200}
                                                                    allowClear
                                                                    className="q1-form-item-xxxl"
                                                                />
                                                            </Form.Item>
                                                        </>
                                                    ) : null}
                                                    {gameDownloadTypes.includes(DOWNLOAD_TYPE_ENUM.IOS) ? (
                                                        <>
                                                            <Form.Item
                                                                name={[ 'extendConfig', 'clubIosIcon' ]}
                                                                label="IOS图标"
                                                                extra="建议200*200，png、jpg格式"
                                                                labelCol={LableCol}
                                                                required
                                                                rules={[ { required: true, message: '请上传图标' } ]}
                                                            >
                                                                <UploadImg
                                                                    imageOrigin=""
                                                                    uploadOption={ClubUploadOption}
                                                                    maxSize={10 * 1024 * 1024}
                                                                    accept="image/png,image/jpeg"
                                                                    isRandomFileName={true}
                                                                />
                                                            </Form.Item>
                                                            <Form.Item
                                                                label="IOS商店地址"
                                                                name={[ 'extendConfig', 'clubIosDownloadLink' ]}
                                                                required
                                                                rules={[ { required: true, message: '请输入' } ]}
                                                                labelCol={LableCol}
                                                            >
                                                                <Input
                                                                    maxLength={200}
                                                                    allowClear
                                                                    className="q1-form-item-xxxl"
                                                                />
                                                            </Form.Item>
                                                            <Form.Item
                                                                label="IOS Scheme链接"
                                                                name={[ 'extendConfig', 'clubIosPackageName' ]}
                                                                required
                                                                rules={[ { required: true, message: '请输入' } ]}
                                                                labelCol={LableCol}
                                                            >
                                                                <Input
                                                                    maxLength={200}
                                                                    allowClear
                                                                    className="q1-form-item-xxxl"
                                                                />
                                                            </Form.Item>
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
        </>
    );
}

export default inject('GoodsInfo')(observer(AccountForm));
