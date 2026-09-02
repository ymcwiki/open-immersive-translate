import type {
  AssistantChatMessage,
  AssistantRequest,
} from "../../shared/k-assistant";

const DEFAULT_ASSISTANT_INSTRUCTION =
  "请直接、准确地完成用户请求。保留事实、术语和必要格式，不添加无关说明。";

export function assistantInstruction(request: AssistantRequest): string {
  if (request.instruction?.trim()) return request.instruction.trim();
  if (request.kind === "translate") {
    return `把用户文本从 ${request.from ?? "自动检测"} 翻译为 ${request.to ?? "简体中文"}。只输出译文，不要解释。`;
  }
  return DEFAULT_ASSISTANT_INSTRUCTION;
}

export function assistantConversation(
  request: AssistantRequest,
): AssistantChatMessage[] {
  return [...(request.history ?? []), { role: "user", content: request.text }];
}
