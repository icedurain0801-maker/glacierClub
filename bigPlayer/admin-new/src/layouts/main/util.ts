export interface ContentMemo {
  title?: string;
  [k: string]: any;
}

export function openNewTab(url: string) {
  window.open(url, '_blank');
}

export function getPageTitle(path: string): string {
  return path.split('/').filter(Boolean).pop() || 'Home';
}

