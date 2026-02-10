function asString(x: unknown): string {
  return typeof x === "string" ? x : "";
}

function wantsXml(params: any): boolean {
  const fmt = asString(params?.format || params?.outputFormat || params?.responseFormat).toLowerCase();
  if (fmt.includes("xml")) return true;
  // dynamicPromptExecFromState passes something like { format: 'XML', ... }
  return false;
}

function wantsJson(params: any): boolean {
  const fmt = asString(params?.format || params?.outputFormat || params?.responseFormat).toLowerCase();
  if (fmt.includes("json")) return true;
  if (params?.schema) return true;
  // Some evaluators pass { mode: 'json' }
  const mode = asString(params?.mode).toLowerCase();
  if (mode.includes("json")) return true;
  return false;
}

export function stubText(params: any): string {
  const prompt = asString(params?.prompt);
  const promptLower = prompt.toLowerCase();

  // Many Eliza call sites encode the required output format in the prompt text.
  const promptWantsJson =
    promptLower.includes("respond with a json object") ||
    promptLower.includes("respond with json") ||
    promptLower.includes("return a json object") ||
    promptLower.includes("output a json object") ||
    promptLower.includes("json object containing") ||
    promptLower.includes("\"detected\"") && promptLower.includes("\"confidence\"");

  const promptWantsXml =
    promptLower.includes("format xml") ||
    promptLower.includes("respond in xml") ||
    promptLower.includes("<response") ||
    promptLower.includes("</response>") ||
    promptLower.includes("xml block");

  // If a schema/JSON format is requested, return valid JSON.
  if (wantsJson(params) || promptWantsJson) {
    // Return a minimal but valid JSON object so JSON.parse succeeds.
    return JSON.stringify({
      detected: false,
      confidence: 0,
      type: "none",
      thought: "",
      actions: [],
      text: "codex oauth not logged in"
    });
  }

  // If XML is requested, return an XML block.
  // Core's XML extractor finds the first <tag>...</tag> block.
  if (wantsXml(params) || promptWantsXml) {
    return [
      "<response>",
      "  <thought></thought>",
      "  <actions>[]</actions>",
      "  <text>codex oauth not logged in</text>",
      "</response>",
    ].join("\n");
  }

  // Default: plain string.
  return "codex oauth not logged in";
}
