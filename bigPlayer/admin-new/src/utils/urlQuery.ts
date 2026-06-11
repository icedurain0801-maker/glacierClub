export function removeUrlQuery(key: string): void {
  const url = new URL(window.location.href)
  url.searchParams.delete(key)
  window.history.replaceState({}, '', url.toString())
}

export function getUrlQuery(key: string): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get(key)
}

export function buildUrlQuery(params: Record<string, string | number | undefined>): string {
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  return query ? `?${query}` : ''
}

export default { getUrlQuery, buildUrlQuery }
