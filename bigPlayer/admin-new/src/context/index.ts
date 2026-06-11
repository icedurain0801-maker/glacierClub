import { useCallback, useEffect, useRef, useState } from 'react';
import { makeObservable, observable, action } from 'mobx';

const runtimeEnv =
  typeof window !== 'undefined'
    ? (((window as unknown) as { processEnv?: Record<string, string> }).processEnv ||= {})
    : undefined;
const goodsIcon =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22 viewBox=%220 0 48 48%22%3E%3Crect width=%2248%22 height=%2248%22 rx=%228%22 fill=%22%23fff7e6%22/%3E%3Ctext x=%2224%22 y=%2229%22 text-anchor=%22middle%22 font-size=%2210%22 fill=%22%23d46b08%22%3EGoods%3C/text%3E%3C/svg%3E';

function getHashSearch() {
  if (typeof window === 'undefined') {
    return '';
  }
  const hash = window.location.hash || '';
  const queryIndex = hash.indexOf('?');
  return queryIndex >= 0 ? hash.slice(queryIndex) : window.location.search;
}

function getHashPath() {
  if (typeof window === 'undefined') {
    return '';
  }
  return (window.location.hash || '').replace(/^#/, '').split('?')[0];
}

if (runtimeEnv) {
  Object.assign(
    runtimeEnv,
    {
      CLUB_OSS_BUCKETNAME: JSON.stringify({ zh: 'Q1-Operation-Bulletin', en: 'Q1-Operation-Bulletin' }),
      OPS_OSS_HOST: 'https://opsoss.q1.com/',
      OPS_OSS_HOST_EA: 'https://opsoss.q1.com/',
      CLUB_2C_HOST: JSON.stringify({ zh: 'http://localhost:5173/#', en: 'http://localhost:5173/#' }),
    },
    runtimeEnv
  );
}

export class UIState {
  loading = false;

  constructor() {
    makeObservable(this, {
      loading: observable,
      setLoading: action,
    });
  }

  setLoading(loading: boolean) {
    this.loading = loading;
  }

  gotoTab(next: { pathname: string; search?: string }) {
    const pathname = next.pathname.replace(/^\/game/, '');
    window.location.hash = `${pathname}${next.search || ''}`;
    // mock 实现：noop
  }
}

export class User {
  id = 'user-1';
  name = 'admin';
  username = 'admin';
  email = 'admin@example.com';

  constructor() {
    makeObservable(this, {
      id: observable,
      name: observable,
      username: observable,
      email: observable,
    });
  }
}

export class Club {
  clubId = '';
  clubName = '';
  isLoaded = true;
  boardFlat = [
    { id: 1, name: 'Main Board', clubDeployVersion: 'zh' },
    { id: 2, name: 'Game Talk', clubDeployVersion: 'zh' },
  ];
  languageOptions = [
    { label: 'Simplified Chinese', value: 'zh-CN' },
    { label: 'English', value: 'en-US' },
  ];
  languageOptionsLoading = false;
  userRoleDictAll: Record<string, Array<{ label: string; value: string }>> = {
    zh: [
      { label: 'Core Player', value: 'core' },
      { label: 'Creator', value: 'creator' },
    ],
    en: [{ label: 'Global Player', value: 'global' }],
  };
  userLabelDictAll: Record<string, Array<{ id: number; parentId: number; name: string }>> = {
    zh: [
      { id: 100, parentId: 0, name: 'Activity' },
      { id: 101, parentId: 100, name: 'High Value' },
      { id: 102, parentId: 100, name: 'New User' },
    ],
    en: [
      { id: 200, parentId: 0, name: 'Global' },
      { id: 201, parentId: 200, name: 'English' },
    ],
  };

  constructor() {
    makeObservable(this, {
      clubId: observable,
      clubName: observable,
      isLoaded: observable,
      boardFlat: observable,
      languageOptions: observable,
      languageOptionsLoading: observable,
      userRoleDictAll: observable,
      userLabelDictAll: observable,
      refreshClubStoreApi: action,
      refreshLanguageOptions: action,
    });
  }

  refreshClubStoreApi() {
    this.isLoaded = true;
  }

  refreshLanguageOptions() {
    this.languageOptionsLoading = false;
  }
}

export class Permit {
  hasFunctionPermit(_code: string) {
    return true;
  }

  hasRolePermit(_code: string) {
    return true;
  }
}

export class Game {
  isLoaded = true;
  worldList = [
    { id: 1, name: 'World 1' },
    { id: 2, name: 'World 2' },
  ];

  constructor() {
    makeObservable(this, {
      isLoaded: observable,
      worldList: observable,
    });
  }
}

export class GameContext {
  gameMap: Record<string, { id: number; name: string; state: number }> = {
    1: { id: 1, name: 'Demo Game', state: 1 },
    2: { id: 2, name: 'Arena Game', state: 1 },
  };

  constructor() {
    makeObservable(this, {
      gameMap: observable,
    });
  }

  getGameVersionName(_gameId: number | string, version?: string) {
    return version || 'v1';
  }
}

export class GoodsInfo {
  goods = [
    { GoodsId: 1001, Name: 'Gold Pack', Icon: goodsIcon },
    { GoodsId: 1002, Name: 'Avatar Frame', Icon: goodsIcon },
  ];

  constructor() {
    makeObservable(this, {
      goods: observable,
    });
  }

  getGoodsInfo() {
    return this.goods;
  }
}

export class Store {
  UIState = new UIState();
  User = new User();
  Club = new Club();
  Permit = new Permit();
  Game = new Game();
  GameContext = new GameContext();
  GoodsInfo = new GoodsInfo();
}

export type StoreType = Store;

let storeInstance: Store | null = null;

export function getStore(): Store {
  if (!storeInstance) {
    storeInstance = new Store();
  }
  return storeInstance;
}

export function useStore(): Store {
  return getStore();
}

export function useContentDialogContainer(): () => HTMLElement {
  return () => document.body;
}

export function useContentPermissionFn() {
  // mock: 默认所有权限都通过
  return {
    hasFunctionPermit: (_code: string) => true,
  };
}

export function useContentTabSearch(): URLSearchParams {
  const [search, setSearch] = useState(
    () => new URLSearchParams(getHashSearch())
  );
  useEffect(() => {
    const onPop = () => setSearch(new URLSearchParams(getHashSearch()));
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onPop);
    };
  }, []);
  return search;
}

export function useReactive(effect: () => void) {
  const stable = useCallback(effect, []);
  useEffect(() => { stable(); }, [stable]);
}

export function useContentTab() {
  return { key: '', setKey: (_k: string) => {} };
}

export function useContentParams<T = Record<string, string>>(): T {
  const params = Object.fromEntries(new URLSearchParams(getHashSearch()));
  const pathParts = getHashPath().split('/').filter(Boolean);
  const lotteryIndex = pathParts.indexOf('lottery');
  if (lotteryIndex >= 0 && pathParts[lotteryIndex + 2]) {
    params.id = pathParts[lotteryIndex + 2];
  }
  const pushIndex = pathParts.indexOf('push');
  if (pushIndex >= 0 && pathParts[pushIndex + 1] === 'edit' && pathParts[pushIndex + 2]) {
    params.editId = pathParts[pushIndex + 2];
  }
  if (pushIndex >= 0 && pathParts[pushIndex + 1] === 'copy' && pathParts[pushIndex + 2]) {
    params.copyId = pathParts[pushIndex + 2];
  }
  return params as unknown as T;
}

export function useContentHistory() {
  return {
    push: (path: string) => { window.location.hash = path; },
    replace: (path: string) => { window.location.hash = path; },
    goBack: () => window.history.back(),
  };
}

export function useLiveContentTabSearch(): URLSearchParams {
  return new URLSearchParams(getHashSearch());
}

export function useIsEqualState<T>(value: T, isEqual: (prev: T, next: T) => boolean = Object.is): T {
  const stableValue = useRef(value);
  if (!isEqual(stableValue.current, value)) {
    stableValue.current = value;
  }
  return stableValue.current;
}

export function useWrapModal() {
  const [visible, setVisible] = useState(false);
  return { visible, open: () => setVisible(true), close: () => setVisible(false) };
}

export function useRevisible(initialVisible = false) {
  const [visible, setVisible] = useState(initialVisible);
  const [key, setKey] = useState(0);
  return {
    visible,
    open: () => { setKey(k => k + 1); setVisible(true); },
    close: () => setVisible(false),
    key,
  };
}
