import { BaseAdapter } from "./baseAdapter";
import type { BaseResponse, AdapterConfig } from "./types";
import * as endpoints from "./cloudEndpoints.json";

export class CohereAdapter extends BaseAdapter {
    private readonly defaultConfig = {
        temperature: 0.7,
        chat_history: [],
        stream: false,
    };

    constructor(config: AdapterConfig) {
        super({
            ...config,
            endpoint: config.endpoint || endpoints.cohere,
        });
        this.provider = {
            name: "cohere",
            requestFormat: {
                body: {
                    model: config.modelName,
                    message: "",
                    ...this.defaultConfig,
                },
            },
            responseFormat: {
                path: ["text"],
                errorPath: ["message"],
            },
        };
    }

    public formatRequest(prompt: string): Record<string, unknown> {
        const baseRequest = super.formatRequest(prompt);
        const temperature =
            this.getTemperatureOverride() ?? this.defaultConfig.temperature;

        return {
            ...baseRequest,
            message: prompt,
            ...this.defaultConfig,
            temperature,
            connectors: [],
        };
    }

    public parseResponse(response: unknown): BaseResponse {
        try {
            const content = this.getStringPath(response, ["text"]);
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
            throw new Error(`Failed to parse Cohere response: ${message}`);
        }
    }

    public validateConfig(): string | null {
        if (!this.config.apiKey) {
            return "API key is required for Cohere";
        }
        if (!this.config.endpoint) {
            return "Endpoint is required for Cohere";
        }
        if (!this.config.modelName) {
            return "Model name is required for Cohere";
        }
        return null;
    }

    public extractError(error: unknown): string {
        return this.getErrorMessage(error, [
            ["message"],
            ["response", "data", "message"],
        ]);
    }

    public getHeaders(): Record<string, string> {
        if (!this.config.apiKey) {
            throw new Error("API key is required for Cohere");
        }
        return {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
            Accept: "application/json",
        };
    }
}
