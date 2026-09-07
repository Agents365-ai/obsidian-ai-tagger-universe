import { requestUrl } from "obsidian";
import { BaseAdapter } from "./baseAdapter";
import type { AdapterConfig, ParsedJsonValue } from "./types";

export class SiliconflowAdapter extends BaseAdapter {
  constructor(config: AdapterConfig) {
    super(config);
    this.provider = {
      name: "siliconflow",
      requestFormat: {
        url: "/v1/chat/completions",
        headers: {},
        body: {
          model: this.config.modelName,
          messages: [],
        },
      },
      responseFormat: {
        path: ["choices", 0, "message", "content"],
        errorPath: ["error", "message"],
      },
    };
  }

  getHeaders(): Record<string, string> {
    if (!this.config.apiKey) {
      throw new Error("API key is required for Siliconflow");
    }
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  formatRequest(prompt: string): Record<string, unknown> {
    const requestBody: Record<string, unknown> = {
      model: this.config.modelName || "siliconflow-chat",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    };

    const temperature = this.getTemperatureOverride();
    if (temperature !== null) {
      requestBody.temperature = temperature;
    }

    return requestBody;
  }

  public validateConfig(): string | null {
    const baseValidation = super.validateConfig();
    if (baseValidation) return baseValidation;

    if (!this.config.apiKey) {
      return "API key is required for Siliconflow";
    }
    return null;
  }

  async testConnection(): Promise<{ result: any; error?: any }> {
    try {
      const response = await requestUrl({
        url: `${this.getEndpoint()}/v1/chat/completions`,
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(this.formatRequest("test")),
        throw: false,
      });

      if (response.status < 200 || response.status >= 300) {
        let errorBody: unknown = null;
        try {
          errorBody = response.json;
        } catch {
          // Non-JSON error body
        }
        const message = this.getPathValue(errorBody, ["error", "message"]);
        return {
          result: null,
          error:
            typeof message === "string" && message
              ? message
              : "Connection test failed",
        };
      }

      return { result: { success: true } };
    } catch (error) {
      return {
        result: null,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  parseResponse(response: unknown): ParsedJsonValue | undefined {
    let result: unknown = response;
    if (this.provider?.responseFormat?.path) {
      for (const key of this.provider.responseFormat.path) {
        const record = this.asRecord(result);
        if (!record) {
          throw new Error("Failed to parse Siliconflow response");
        }
        result = record[key];
      }
    }
    return result as ParsedJsonValue | undefined;
  }
}
