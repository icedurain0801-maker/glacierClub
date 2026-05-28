import moment from 'moment';

import { CLUB_DEPLOY_VERSION, CLUB_ENVIRONMENT_ENUM } from '@ts/club';

/** 大玩家OSS-BUCKET服务地址 */
export function useClubUploadOption(props: { clubDeployVersion: CLUB_DEPLOY_VERSION | '' }) {
    const { clubDeployVersion } = props;
    let result = {
        serviceName: 'Q1-Operation-Bulletin',
        tenant: `club/${moment().format('YYYY/MM/DD')}`,
    };
    try {
        const serviceNameDict = JSON.parse(window.processEnv.CLUB_OSS_BUCKETNAME || '{"zh":"Q1-Operation-Bulletin"}');
        if (clubDeployVersion in serviceNameDict) {
            result.serviceName = serviceNameDict[clubDeployVersion];
        }
    } catch (e) {
        console.log('大玩家OSS-BUCKET服务地址解析异常：', e);
    }
    return result;
}

export const getClubImageHost = (clubDeployVersion: CLUB_DEPLOY_VERSION) => {
    if (process.env.CONFIG_ENV !== 'production' || clubDeployVersion !== CLUB_ENVIRONMENT_ENUM.EN) {
        return window.processEnv?.OPS_OSS_HOST
            ? window.processEnv.OPS_OSS_HOST.endsWith('/')
                ? window.processEnv.OPS_OSS_HOST
                : window.processEnv.OPS_OSS_HOST + '/'
            : 'https://opsoss.q1.com/';
    } else {
        return window.processEnv?.OPS_OSS_HOST_EA
            ? window.processEnv.OPS_OSS_HOST_EA.endsWith('/')
                ? window.processEnv.OPS_OSS_HOST_EA
                : window.processEnv.OPS_OSS_HOST_EA + '/'
            : 'https://opsoss-ea.q1.com/';
    }
};
