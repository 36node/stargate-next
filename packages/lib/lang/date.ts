/**
 * 日期格式化工具函数
 */

/**
 * 将日期格式化为 YYYY-MM-DD 格式
 * @param date - 要格式化的日期
 * @returns 格式化后的日期字符串
 */
export function ymd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 将日期格式化为 YYYY-MM-DD HH:mm:ss 格式
 * @param date - 要格式化的日期
 * @returns 格式化后的日期时间字符串
 */
export function ymdhms(date: Date): string {
  const dateStr = ymd(date);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${dateStr} ${hours}:${minutes}:${seconds}`;
}

/**
 * 获取相对时间描述（如：3分钟前、2小时前）
 * @param date - 要比较的日期
 * @param now - 当前时间，默认为 new Date()
 * @returns 相对时间描述字符串
 */
export function getRelativeTime(date: Date, now: Date = new Date()): string {
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return "刚刚";
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes}分钟前`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}小时前`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) {
    return `${diffInDays}天前`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths}个月前`;
  }

  const diffInYears = Math.floor(diffInMonths / 12);
  return `${diffInYears}年前`;
}

/**
 * 判断是否为同一天
 * @param date1 - 第一个日期
 * @param date2 - 第二个日期
 * @returns 是否为同一天
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * 获取某个月的天数
 * @param year - 年份
 * @param month - 月份（1-12）
 * @returns 该月的天数
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
