const versions = [
  { id: 1, gameId: 1, gameName: 'Demo Game', name: 'Demo Game', key: 'v1', version: 'v1', platform: 'pc' },
  { id: 2, gameId: 1, gameName: 'Demo Game', name: 'Demo Game', key: 'v2', version: 'v2', platform: 'mobile' },
  { id: 3, gameId: 2, gameName: 'Arena Game', name: 'Arena Game', key: 'v1', version: 'v1', platform: 'pc' },
];

const channels = [
  { id: 1, name: 'Official', value: 'official' },
  { id: 2, name: 'Web', value: 'web' },
];

export const getGameEnvList = (..._args: any[]) => Promise.resolve(versions);
export const getAllChannel = (..._args: any[]) => Promise.resolve(channels);
export const getGameenvV1Version = (..._args: any[]) => Promise.resolve(versions);
