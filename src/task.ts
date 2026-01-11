export enum TaskStatus {
  PENDING = 0,
  PROCESSING = 1,
  COMPLETED = 2,
  FAILED = 3,
}

export function statusToString(status: number | null | undefined) {
  if (status == null) return 'UNKNOWN'
  return TaskStatus[status] ?? 'UNKNOWN'
}
