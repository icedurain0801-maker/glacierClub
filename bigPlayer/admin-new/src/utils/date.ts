import moment from 'moment';

export function simpleTime(input?: string | Date | number): string {
  if (!input) return '';
  const d = new Date(input);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function setUtcFormat(input?: string | Date | number): string {
  if (!input) return '';
  return moment(input).utc().format('YYYY-MM-DD HH:mm:ss');
}

export function setUtcStartTimeAndFormat(input?: string | Date | null): string {
  if (!input) return '';
  return moment(input).startOf('day').utc().format('YYYY-MM-DD HH:mm:ss');
}

export function setUtcEndTimeAndFormat(input?: string | Date | null): string {
  if (!input) return '';
  return moment(input).endOf('day').utc().format('YYYY-MM-DD HH:mm:ss');
}

export function quickPickTimeRange() {
  const now = moment();
  return {
    今日: [now.clone().startOf('day'), now.clone().endOf('day')],
    近7天: [now.clone().subtract(6, 'days').startOf('day'), now.clone().endOf('day')],
    近30天: [now.clone().subtract(29, 'days').startOf('day'), now.clone().endOf('day')],
  };
}

export function recentMonthQuickPickTimeRange() {
  return quickPickTimeRange();
}
