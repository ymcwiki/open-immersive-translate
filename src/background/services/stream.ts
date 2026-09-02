import { TranslateError, type TranslationStreamOptions } from "./base";

export async function readSse(
  response: Response,
  serviceId: string,
  onData: (data: string, eventType?: string) => string | undefined,
  options?: TranslationStreamOptions,
): Promise<string> {
  if (!response.body) {
    throw new TranslateError("parse", "Streaming response has no body.", {
      serviceId,
      retryable: false,
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = "";

  const consume = async (event: string): Promise<void> => {
    const eventType = event
      .split(/\r?\n/)
      .find((line) => line.startsWith("event:"))
      ?.slice(6)
      .trim();
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;
    const delta = onData(data, eventType || undefined);
    if (delta === undefined) return;
    result += delta;
    await options?.onPartial?.(result);
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";
    for (const event of events) await consume(event);
    if (done) break;
  }
  if (buffer.trim()) await consume(buffer);
  return result;
}
