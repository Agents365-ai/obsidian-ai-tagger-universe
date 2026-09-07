import { BaseAdapter } from "./baseAdapter";
import type { BaseResponse, AdapterConfig } from "./types";
import * as endpoints from "./cloudEndpoints.json";
import { SYSTEM_PROMPT } from "../../utils/constants";

export class RequestyAdapter extends BaseAdapter {
    private readonly defaultConfig = {
        temperature: 0.7,
        max_tokens: 1024,
    };

    constructor(config: AdapterConfig) {
        super({
            ...config,
            endpoint: config.endpoint || endpoints.requesty,
        });
        this.provider = {
            name: "requesty",
            requestFormat: {
                url: "/v1/chat/completions",
                headers: {},
                body: {
                    model: config.modelName,
                    messages: [],
                    ...this.defaultConfig,
                },
            },
            responseFormat: {
                path: ["choices", "0", "message", "content"],
                errorPath: ["error", "message"],
            },
        };
    }

    public formatRequest(prompt: string): Record<string, unknown> {
        const baseRequest = super.formatRequest(prompt);
        const temperature =
            this.getTemperatureOverride() ?? this.defaultConfig.temperature;

        return {
            ...baseRequest,
            ...this.defaultConfig,
            temperature,
        };
    }

    public parseResponse(response: unknown): BaseResponse {
        try {
            const content = this.getStringPath(response, [
                "choices",
                0,
                "message",
                "content",
            ]);
            if (!content) {
                throw new Error("Invalid response format: missing content");
            }

            const jsonContent = this.extractJsonFromContent(content);
            const matchedTags = this.getArrayField(jsonContent, "matchedTags");
            const newTags = this.getArrayField(jsonContent, "newTags");
            if (!matchedTags || !newTags) {
                throw new Error(
                    "Invalid response format: missing required arrays",
                );
            }

            return {
                text: content,
                matchedExistingTags: matchedTags,
                suggestedTags: newTags,
            };
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : "Unknown error";
            throw new Error(`Failed to parse Requesty response: ${message}`);
        }
    }

    public validateConfig(): string | null {
        if (!this.config.apiKey) {
            return "API key is required for Requesty AI";
        }
        if (!this.config.endpoint) {
            return "Endpoint is required for Requesty AI";
        }
        if (!this.config.modelName) {
            return "Model name is required for Requesty AI";
        }
        return null;
    }

    public extractError(error: unknown): string {
        return this.getErrorMessage(error, [
            ["error", "message"],
            ["response", "data", "error", "message"],
            ["message"],
        ]);
    }

    public getHeaders(): Record<string, string> {
        if (!this.config.apiKey) {
            throw new Error("API key is required for Requesty AI");
        }
        return {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
            ...(this.provider?.requestFormat.headers || {}),
        };
    }
}
