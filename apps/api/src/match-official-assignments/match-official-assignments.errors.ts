export const assignmentError = (
  code: string,
  message: string,
  details?: object,
) => (details ? { code, message, details } : { code, message });
