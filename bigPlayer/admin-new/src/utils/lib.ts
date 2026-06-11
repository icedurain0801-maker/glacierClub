export function getPathName(): string {
  return typeof window !== 'undefined' ? window.location.pathname : '';
}

export function omitKeys<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj };
  keys.forEach(k => delete result[k]);
  return result;
}

export const falsityArr = [ undefined, '', null ];

export function normalRuleValidator(message = '请填写此项', checkEmptyArray = false) {
  return [
    {
      validator: (_: unknown, value: unknown) => {
        const isEmptyArray = checkEmptyArray && Array.isArray(value) && value.length === 0;
        if (value === undefined || value === null || value === '' || isEmptyArray) {
          return Promise.reject(new Error(message));
        }
        return Promise.resolve();
      },
    },
  ];
}
