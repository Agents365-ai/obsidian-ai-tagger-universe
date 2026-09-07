import { LanguageCode } from "../types";

/**
 * Boundary type for parsed provider JSON payloads. Adapters validate fields
 * out of this shape at their trust boundaries before use.
 */
export type ParsedJsonValue =
    | string
    | number
    | boolean
    | null
    | ParsedJsonValue[]
    | { [key: string]: ParsedJsonValue };

export interface FetchOptions {
    method: string;
    headers: Record<string, string>;
    body?: string;
}

export interface AdapterConfig {
    endpoint: string;
    apiKey: string;
    apiSecret?: string;
    model?: string;
    modelName?: string;
    language?: LanguageCode;
    llmTemperatureOverride?: number | null;
}

export interface RequestBody {
    model?: string;
    messages: Array<{
        role: string;
        content: string;
    }>;
    max_tokens?: number;
    temperature?: number;
}

export interface AdapterRequestParams {
    messages: {
        role: string;
        content: string;
    }[];
    prompt?: string;
    maxTokens?: number;
    temperature?: number;
    model?: string;
}

export interface BaseResponse {
    text: string;
    error?: string;
    matchedExistingTags?: string[];
    suggestedTags?: string[];
    usage?: {
        totalTokens?: number;
        promptTokens?: number;
        completionTokens?: number;
    };
}

export interface RequestConfig {
    endpoint: string;
    apiKey: string;
    apiSecret?: string;
    model?: string;
}

export type AdapterResponse = Promise<BaseResponse>;

export interface LLMServiceProvider {
    name: string;
    requestFormat: {
        url?: string;
        headers?: Record<string, string>;
        body?: Record<string, unknown>;
    };
    responseFormat: {
        path: (string | number)[];
        errorPath?: (string | number)[];
        contentPath?: (string | number)[];
    };
}
