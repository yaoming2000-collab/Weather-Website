import { describe, expect, it } from 'vitest';
import {
  currentHourIndex,
  dateOf,
  hourLabel,
  localDate,
  monthDayOf,
  nextLocalMidnight,
  offsetMinutes,
  toLocalIso,
  weekdayLabel,
} from '../src/time/cityTime';

describe('city time', () => {
  // 2026-10-22 03:00 UTC：上海已经是 22 日中午，美国中部还是 21 日晚上
  const t = Date.UTC(2026, 9, 22, 3, 0);

  it('computes the local date in the city time zone, not the visitor one', () => {
    expect(localDate(t, 'Asia/Shanghai')).toBe('2026-10-22');
    expect(localDate(t, 'America/Chicago')).toBe('2026-10-21');
    expect(localDate(t, 'Europe/London')).toBe('2026-10-22');
  });

  it('formats local ISO times with the right offset, including DST', () => {
    expect(toLocalIso(t, 'Asia/Shanghai')).toBe('2026-10-22T11:00+08:00');
    expect(toLocalIso(t, 'America/Chicago')).toBe('2026-10-21T22:00-05:00'); // 夏令时
    expect(toLocalIso(Date.UTC(2026, 11, 1, 3), 'America/Chicago')).toBe('2026-11-30T21:00-06:00');
    expect(offsetMinutes(t, 'Asia/Kolkata')).toBe(330);
  });

  it('gets the weekday from the city date only (regression: old site showed Fri for Thursday)', () => {
    // 旧站 bug：上海访客看美国城市，周四被显示成周五
    expect(weekdayLabel('2026-10-22', 'en')).toBe('Thu');
    expect(weekdayLabel('2026-10-22', 'en', 'long')).toBe('Thursday');
    expect(weekdayLabel('2026-10-23', 'zh-Hans')).toBe('周五');
    expect(weekdayLabel('2026-10-24', 'tr')).toBe('Cmt');
    expect(weekdayLabel('bad', 'en')).toBe('');
  });

  it('reads hour and date straight from the local ISO string', () => {
    expect(hourLabel('2026-10-22T13:00+04:00')).toBe('13:00');
    expect(dateOf('2026-10-22T23:00-05:00')).toBe('2026-10-22');
    expect(monthDayOf('2026-10-22')).toBe('10-22');
  });

  it('finds the current hour in an hourly series', () => {
    const times = ['2026-10-22T10:00+08:00', '2026-10-22T11:00+08:00', '2026-10-22T12:00+08:00'];
    expect(currentHourIndex(times, t + 20 * 60_000)).toBe(1);
    expect(currentHourIndex(times, Date.UTC(2026, 9, 23))).toBe(-1);
  });
});

describe('next local midnight', () => {
  it('is right on days the clocks change', () => {
    // 伦敦 2026-10-25 凌晨 2 点拨回 1 点（BST → GMT）：下一个午夜是 10-26 00:00 GMT
    expect(nextLocalMidnight(Date.UTC(2026, 9, 24, 23, 30), 'Europe/London')).toBe(Date.UTC(2026, 9, 26, 0));
    // 纽约 2026-03-08 凌晨拨快一小时：下一个午夜是 03-09 00:00 EDT = 04:00Z
    expect(nextLocalMidnight(Date.UTC(2026, 2, 8, 6), 'America/New_York')).toBe(Date.UTC(2026, 2, 9, 4));
    expect(nextLocalMidnight(Date.UTC(2026, 9, 22, 3), 'Asia/Shanghai')).toBe(Date.UTC(2026, 9, 22, 16));
  });
});
