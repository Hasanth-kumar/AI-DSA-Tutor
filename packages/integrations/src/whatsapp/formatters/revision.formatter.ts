export function formatRevisionReminder(topicNames: string[]): string {
  if (topicNames.length === 0) {
    return "";
  }
  const list = topicNames.join(", ");
  const noun = topicNames.length === 1 ? "topic" : "topics";
  return `📅 ${topicNames.length} ${noun} due for revision soon:\n${list}\n\nReply "plan" for today's schedule.`;
}
