/** Normalize FastAPI HTTPException detail (string | validation array) */
export function formatApiError(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => {
        if (e && typeof e === 'object' && 'msg' in e) {
          return String((e as { msg: string }).msg);
        }
        return JSON.stringify(e);
      })
      .join('; ');
  }
  if (detail && typeof detail === 'object') {
    return JSON.stringify(detail);
  }
  return 'Request failed';
}
