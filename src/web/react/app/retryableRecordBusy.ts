export const isRetryableRecordBusyMessage = (value: unknown): boolean => {
  const message = (value === undefined || value === null ? '' : value.toString())
    .trim()
    .toLowerCase();
  if (!message) return false;
  return (
    message.includes('record save lock') ||
    message.includes('record mutation queue') ||
    message.includes('follow-up queue') ||
    message.includes('another follow-up batch is still running') ||
    message.includes('another record mutation is still running') ||
    message.includes('could not queue follow-up actions') ||
    message.includes('could not queue record mutation') ||
    (message.includes('please retry') && (message.includes('follow-up') || message.includes('record')))
  );
};
