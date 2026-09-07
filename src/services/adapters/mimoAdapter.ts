import { BaseAdapter } from "./baseAdapter";
import { AdapterConfig, BaseResponse } from "./types";
import * as endpoints from "./cloudEndpoints.json";

export class MiMoAdapter extends BaseAdapter {
  constructor(config: AdapterConfig) {
    super({
      ...config,
      endpoint: config.endpoint || endpoints.mimo,
      modelName: config.modelName || "MiMo-V2-Flash",
    });
    this.provider = {
      name: "mimo",
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

  public validateConfig(): string | null {
    const baseValidation = super.validateConfig();
    if (baseValidation) return baseValidation;

    if (!this.config.apiKey) {
      return "API key is required for MiMo";
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
      throw new Error(`Failed to parse MiMo response: ${message}`);
    }
  }
}
