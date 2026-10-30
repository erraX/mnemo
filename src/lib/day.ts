export const DAY_BOUNDARY_HOUR = 4

/** 当前时刻所属学习日的开始（本地 04:00）的 epoch ms */
export function learningDayStart(now: number): number {
  const d = new Date(now)
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), DAY_BOUNDARY_HOUR, 0, 0, 0)
  if (now < start.getTime()) start.setDate(start.getDate() - 1)
  return start.getTime()
}

/** 下一个学习日的开始 */
export function nextLearningDayStart(now: number): number {
  const s = new Date(learningDayStart(now))
  s.setDate(s.getDate() + 1)
  return s.getTime()
}

export function isSameLearningDay(a: number, b: number): boolean {
  return learningDayStart(a) === learningDayStart(b)
}
