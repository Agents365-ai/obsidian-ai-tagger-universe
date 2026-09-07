import {
    type LLMResponse,
    type LLMServiceConfig,
    ConnectionTestResult,
    type ConnectionTestError,
} from "./types";
import { SYSTEM_PROMPT, LLM_SERVICE_CONFIG } from "../utils/constants";
import { BaseLLMService } from "./baseService";
import type { TaggingMode } from "./prompts/types";
import type { LanguageCode } from "./types";
import { type App, requestUrl, type RequestUrlResponse } from "obsidian";
import { extractAuthFromUrl } from "./localModelFetcher";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

export class LocalLLMService extends BaseLLMService {
    private readonly MAX_CONTENT_LENGTH = LLM_SERVICE_CONFIG.MAX_CONTENT_LENGTH;
    private readonly MAX_RETRIES = LLM_SERVICE_CONFIG.MAX_RETRIES;
    private readonly RETRY_DELAY = LLM_SERVICE_CONFIG.RETRY_DELAY;
    private llmTemperatureOverride: number | null = null;

    constructor(config: LLMServiceConfig, app: App) {
        super(config, app);
        // Ensure endpoint ends with standard chat completions path
        this.endpoint = this.normalizeEndpoint(config.endpoint);
        this.llmTemperatureOverride =
            typeof config.llmTemperatureOverride === "number" &&
            Number.isFinite(config.llmTemperatureOverride)
                ? config.llmTemperatureOverride
                : null;
        this.validateLocalConfig(); // Validate on construction
    }

    // Store auth headers separately for use in requests
    private authHeaders: Record<string, string> = {
        "Content-Type": "application/json",
    };

    private normalizeEndpoint(endpoint: string): string {
        endpoint = endpoint.trim();
        // Remove trailing slash if present
        endpoint = endpoint.replace(/\/$/, "");

        // Extract authentication if present in URL
        const { url, headers } = extractAuthFromUrl(endpoint);
        this.authHeaders = headers; // Store headers for later use
        endpoint = url; // Use clean URL without auth info

        // Handle common endpoint formats
        // Standard OpenAI-compatible format
        if (!endpoint.endsWith("/v1/chat/completions")) {
            // Check if we have a base URL only
            if (!endpoint.includes("/v1/")) {
                endpoint = `${endpoint}/v1/chat/completions`;
            }
        }

        return endpoint;
    }

    private validateLocalConfig(): string | null {
        const baseError = this.validateConfig();
        if (baseError) return baseError;

        try {
            new URL(this.endpoint);
            // We're not enforcing a specific endpoint format anymore
            // to support different API formats more flexibly
        } catch {
            return "Invalid endpoint URL format";
        }

        return null;
    }

    private async makeRequest(
        options: RequestInit,
        timeoutMs: number,
    ): Promise<RequestUrlResponse> {
        try {
            // Merge the stored authentication headers with the request headers
            const mergedHeaders = {
                ...this.authHeaders,
                ...((options.headers as Record<string, string>) || {}),
            };

            const response = await requestUrl({
                url: this.endpoint,
                method: options.method || "POST",
                headers: mergedHeaders,
                body: options.body as string,
                throw: false,
            });

            return response;
        } catch (error) {
            if (error instanceof Error) {
                if (error.name === "AbortError") {
                    throw new Error(
                        "Request timed out. Please check if your local LLM service is running and responsive.",
                    );
                }
            }
            throw error;
        }
    }

    private async makeRequestWithRetry(
        options: RequestInit,
        timeoutMs: number,
    ): Promise<RequestUrlResponse> {
        let lastError: Error | null = null;

        for (let i = 0; i < this.MAX_RETRIES; i++) {
            try {
                const response = await this.makeRequest(options, timeoutMs);

                // For local service, we might want to retry on any error
                // as it could be starting up or processing another request
                // requestUrl returns {status, json, text, etc.} - status 200-299 is success
                if (response.status >= 200 && response.status < 300) {
                    return response;
                }

                // Read the error response
                const errorText = response.text;
                lastError = new Error(
                    `HTTP error ${response.status}: ${errorText || ""}`,
                );
            } catch (error) {
                lastError =
                    error instanceof Error ? error : new Error("Unknown error");
            }

            await new Promise((resolve) =>
                window.setTimeout(resolve, this.RETRY_DELAY * (i + 1)),
            );
        }

        throw lastError || new Error("Max retries exceeded");
    }

    async testConnection(): Promise<{
        result: ConnectionTestResult;
        error?: ConnectionTestError;
    }> {
        try {
            // Validate configuration first
            const validationError = this.validateLocalConfig();
            if (validationError) {
                return {
                    result: ConnectionTestResult.Failed,
                    error: {
                        type: "network",
                        message: validationError,
                    },
                };
            }

            const response = await this.makeRequestWithRetry(
                {
                    method: "POST",
                    // Don't specify headers here as they will be merged with auth headers in makeRequest
                    body: JSON.stringify({
                        model: this.modelName,
                        messages: [
                            {
                                role: "system",
                                content: "Simple connection test",
                            },
                            {
                                role: "user",
                                content: "Hello",
                            },
                        ],
                        max_tokens: 5,
                    }),
                },
                10000,
            );

            const responseText = response.text;
            // The original inner throw was caught by its own catch, so every
            // malformed body surfaced as this parse-failure message.
            const data: unknown = JSON.parse(responseText);
            if (!isRecord(data) || !Array.isArray(data.choices)) {
                throw new Error("Failed to parse response from local service");
            }

            return { result: ConnectionTestResult.Success };
        } catch (error) {
            let testError: ConnectionTestError = {
                type: "unknown",
                message: "Unknown error",
            };

            if (error instanceof Error) {
                if (error.name === "AbortError") {
                    testError = {
                        type: "timeout",
                        message:
                            "Connection timeout, please check if the local LLM service is running",
                    };
                } else if (error.message.includes("Failed to fetch")) {
                    testError = {
                        type: "network",
                        message:
                            "Network error, please check if the local service is accessible",
                    };
                } else if (error.message.includes("HTTP error")) {
                    const statusMatch = error.message.match(/HTTP error (\d+)/);
                    const status = statusMatch ? parseInt(statusMatch[1]) : 0;
                    let hint = "";
                    if (status === 502 || status === 503) {
                        hint =
                            ". Please verify that your local LLM service is running and a model is loaded.";
                    } else if (status === 404) {
                        hint =
                            ". Please check that your endpoint URL is correct.";
                    }
                    testError = {
                        type: "network",
                        message: `Service error: ${error.message}${hint}`,
                    };
                } else if (error.message.includes("Invalid response")) {
                    testError = {
                        type: "unknown",
                        message: "Invalid response format from local service",
                    };
                }
            }

            return {
                result: ConnectionTestResult.Failed,
                error: testError,
            };
        }
    }

    /**
     * Analyzes content and returns tag suggestions
     * @param content - Content to analyze
     * @param existingTags - Array of existing tags to consider
     * @param mode - Tagging mode
     * @param maxTags - Maximum number of tags to return
     * @param language - Language for generated tags
     * @returns Promise resolving to tag analysis result
     */
    async analyzeTags(
        content: string,
        existingTags: string[],
        mode: TaggingMode,
        maxTags: number,
        language?: LanguageCode,
    ): Promise<LLMResponse> {
        // Use the base class implementation
        return super.analyzeTags(
            content,
            existingTags,
            mode,
            maxTags,
            language,
        );
    }

    /**
     * Sends a request to the LLM service and returns the response
     * @param prompt - The prompt to send
     * @returns Promise resolving to the response
     */
    protected async sendRequest(prompt: string): Promise<string> {
        const response = await this.makeRequestWithRetry(
            {
                method: "POST",
                // Don't specify headers here as they will be merged with auth headers in makeRequest
                body: JSON.stringify({
                    model: this.modelName,
                    messages: [
                        {
                            role: "system",
                            content: SYSTEM_PROMPT,
                        },
                        {
                            role: "user",
                            content: prompt,
                        },
                    ],
                    temperature: this.llmTemperatureOverride ?? 0.3,
                }),
            },
            this.TIMEOUT,
        );

        if (response.status < 200 || response.status >= 300) {
            const errorText = response.text;
            throw new Error(
                `HTTP error ${response.status}: ${errorText || ""}`,
            );
        }

        const data: unknown = JSON.parse(response.text);
        if (
            !isRecord(data) ||
            !Array.isArray(data.choices) ||
            data.choices.length === 0
        ) {
            throw new Error("Invalid response format from service");
        }

        const message = isRecord(data.choices[0])
            ? data.choices[0].message
            : undefined;
        const content = isRecord(message) ? message.content : undefined;
        return typeof content === "string" && content ? content : "";
    }

    /**
     * Gets the maximum content length for this service
     * @returns Maximum content length
     */
    protected getMaxContentLength(): number {
        return this.MAX_CONTENT_LENGTH;
    }
}
