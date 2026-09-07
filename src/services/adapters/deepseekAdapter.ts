import { BaseAdapter } from "./baseAdapter";
import { AdapterConfig, RequestBody, BaseResponse } from "./types";
import * as endpoints from "./cloudEndpoints.json";

export class DeepseekAdapter extends BaseAdapter {
  constructor(config: AdapterConfig) {
    super({
      ...config,
      endpoint: config.endpoint || endpoints.deepseek,
      modelName: config.modelName || "deepseek-chat",
    });
    this.provider = {
      name: "deepseek",
      requestFormat: {
        body: {
          model: this.modelName,
        },
      },
      responseFormat: {
        path: ["choices", "0", "message", "content"],
        errorPath: ["error", "message"],
      },
    };
  }

  getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private readonly defaultConfig = {
    defaultModel: "deepseek-chat",
  };

  public validateConfig(): string | null {
    const baseValidation = super.validateConfig();
    if (baseValidation) return baseValidation;

    if (!this.config.apiKey) {
      return "API key is required for Deepseek";
    }
    return null;
  }

  parseResponse(response: unknown): BaseResponse {
    try {
      const content = this.getStringPath(response, [
        "choices",
        0,
        "message",
        "content",
      ]);
      const jsonContent = this.extractJsonFromContent(content);

      return {
        text: content,
        matchedExistingTags:
          this.getArrayField(jsonContent, "matchedTags") ?? [],
        suggestedTags: this.getArrayField(jsonContent, "newTags") ?? [],
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to parse Deepseek response: ${message}`);
    }
  }
}
