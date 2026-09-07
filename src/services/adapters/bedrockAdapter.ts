import { BaseAdapter } from "./baseAdapter";
import type { BaseResponse, AdapterConfig } from "./types";
import * as endpoints from "./cloudEndpoints.json";

export class BedrockAdapter extends BaseAdapter {
    private readonly defaultConfig = {
        max_tokens: 1024,
        temperature: 0.7,
    };

    constructor(config: AdapterConfig) {
        super({
            ...config,
            endpoint: config.endpoint || endpoints.bedrock,
            modelName:
                config.modelName || "anthropic.claude-3-haiku-20240307-v1:0",
        });
        this.provider = {
            name: "bedrock",
            requestFormat: {
                url: "/model/invoke",
                headers: {},
                body: {
                    model: this.modelName,
                },
            },
            responseFormat: {
                path: ["completion"],
                errorPath: ["errorMessage"],
            },
        };
    }

    public formatRequest(prompt: string): Record<string, unknown> {
        const modelName = this.config.modelName || "";
        const baseRequest = super.formatRequest(prompt);
        delete baseRequest.temperature;
        const temperature =
            this.getTemperatureOverride() ?? this.defaultConfig.temperature;

        // Provide different request formats based on model type
        if (modelName.includes("claude")) {
            return {
                ...baseRequest,
                prompt: `\n\nHuman: ${prompt}\n\nAssistant: `,
                ...this.defaultConfig,
                temperature,
                anthropic_version: "2023-01-01",
            };
        } else if (modelName.includes("titan")) {
            return {
                ...baseRequest,
                inputText: prompt,
                textGenerationConfig: {
                    maxTokenCount: this.defaultConfig.max_tokens,
                    temperature,
                    stopSequences: [],
                },
            };
        }

        return {
            ...baseRequest,
            prompt,
            ...this.defaultConfig,
            temperature,
        };
    }

    public parseResponse(response: unknown): BaseResponse {
        try {
            const modelName = this.config.modelName || "";
            let content = "";

            if (modelName.includes("claude")) {
                content = this.getStringPath(response, ["completion"]);
            } else if (modelName.includes("titan")) {
                content = this.getStringPath(response, [
                    "results",
                    0,
                    "outputText",
                ]);
            } else {
                content = this.getStringPath(response, ["generation"]);
            }

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
            throw new Error(`Failed to parse Bedrock response: ${message}`);
        }
    }

    public validateConfig(): string | null {
        if (!this.config.apiKey) {
            return "API key is required for AWS Bedrock";
        }
        if (!this.config.endpoint) {
            return "Endpoint is required for AWS Bedrock";
        }
        if (!this.config.modelName) {
            return "Model name is required for AWS Bedrock";
        }
        return null;
    }

    public extractError(error: unknown): string {
        return this.getErrorMessage(error, [
            ["errorMessage"],
            ["response", "data", "errorMessage"],
            ["message"],
        ]);
    }

    public getHeaders(): Record<string, string> {
        return {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
        };
    }
}
