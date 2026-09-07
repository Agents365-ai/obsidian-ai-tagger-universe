import { Setting, ButtonComponent, Notice, requestUrl } from "obsidian";
import { ConnectionTestResult } from "../../services";
import { BaseSettingSection } from "./BaseSettingSection";

export class LLMSettingsSection extends BaseSettingSection {
    private statusContainer: HTMLElement = null!;
    private statusEl: HTMLElement = null!;
    private isUpdatingTemperatureInput: boolean = false;

    display(): void {
        this.containerEl.createEl("h1", {
            text: this.plugin.t.settings.llm.title,
        });
        this.createServiceTypeDropdown();
        this.plugin.settings.serviceType === "local"
            ? this.displayLocalSettings()
            : this.displayCloudSettings();

        // Note: checkLocalService is called only from commitChange in the
        // endpoint input, not here, to avoid Notice popups stealing focus.

        // Debug mode toggle
        new Setting(this.containerEl)
            .setName(this.plugin.t.settings.llm.debugMode)
            .setDesc(this.plugin.t.settings.llm.debugModeDesc)
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.debugMode)
                    .onChange(async (value) => {
                        this.plugin.settings.debugMode = value;
                        await this.plugin.saveSettings();
                        new Notice(
                            value
                                ? this.plugin.t.settings.llm.debugEnabled
                                : this.plugin.t.settings.llm.debugDisabled,
                        );
                    }),
            );
    }

    private createServiceTypeDropdown(): void {
        if (!this.plugin.settings.serviceType) {
            this.plugin.settings.serviceType = "cloud";
        }
        new Setting(this.containerEl)
            .setName(this.plugin.t.settings.llm.serviceType)
            .setDesc(this.plugin.t.settings.llm.serviceTypeDesc)
            .addDropdown((dropdown) =>
                dropdown
                    .addOptions({
                        local: this.plugin.t.dropdowns.localLLM,
                        cloud: this.plugin.t.dropdowns.cloudService,
                    })
                    .setValue(this.plugin.settings.serviceType)
                    .onChange(async (value) => {
                        this.plugin.settings.serviceType = value as
                            | "local"
                            | "cloud";
                        await this.plugin.saveSettings();
                        this.settingTab.display();
                    }),
            );

        if (this.plugin.settings.serviceType === "cloud") {
            new Setting(this.containerEl)
                .setName(this.plugin.t.settings.llm.cloudProvider)
                .setDesc(this.plugin.t.settings.llm.cloudProviderDesc)
                .addDropdown((dropdown) =>
                    dropdown
                        .addOptions({
                            openai: this.plugin.t.dropdowns.openai,
                            gemini: this.plugin.t.dropdowns.gemini,
                            deepseek: this.plugin.t.dropdowns.deepseek,
                            aliyun: this.plugin.t.dropdowns.aliyun,
                            claude: this.plugin.t.dropdowns.claude,
                            groq: this.plugin.t.dropdowns.groq,
                            vertex: this.plugin.t.dropdowns.vertex,
                            openrouter: this.plugin.t.dropdowns.openrouter,
                            bedrock: this.plugin.t.dropdowns.bedrock,
                            requesty: this.plugin.t.dropdowns.requesty,
                            cohere: this.plugin.t.dropdowns.cohere,
                            grok: this.plugin.t.dropdowns.grok,
                            mistral: this.plugin.t.dropdowns.mistral,
                            glm: this.plugin.t.dropdowns.glm,
                            mimo: this.plugin.t.dropdowns.mimo,
                            minimax: this.plugin.t.dropdowns.minimax,
                            "openai-compatible":
                                this.plugin.t.dropdowns.openaiCompatible,
                        })
                        .setValue(this.plugin.settings.cloudServiceType)
                        .onChange(async (value) => {
                            const type = value as
                                | "openai"
                                | "gemini"
                                | "deepseek"
                                | "aliyun"
                                | "claude"
                                | "groq"
                                | "vertex"
                                | "openrouter"
                                | "bedrock"
                                | "requesty"
                                | "cohere"
                                | "grok"
                                | "mistral"
                                | "glm"
                                | "mimo"
                                | "minimax"
                                | "openai-compatible";
                            this.plugin.settings.cloudServiceType = type;

                            try {
                                const endpoints = await import(
                                    "../../services/adapters/cloudEndpoints.json"
                                );
                                switch (type) {
                                    case "openai":
                                        this.plugin.settings.cloudEndpoint =
                                            endpoints.openai;
                                        this.plugin.settings.cloudModel =
                                            "gpt-4o";
                                        break;
                                    case "gemini":
                                        this.plugin.settings.cloudEndpoint =
                                            endpoints.gemini;
                                        this.plugin.settings.cloudModel =
                                            "gemini-2.0-flash";
                                        break;
                                    case "deepseek":
                                        this.plugin.settings.cloudEndpoint =
                                            endpoints.deepseek;
                                        this.plugin.settings.cloudModel =
                                            "deepseek-chat";
                                        break;
                                    case "aliyun":
                                        this.plugin.settings.cloudEndpoint =
                                            endpoints.aliyun;
                                        this.plugin.settings.cloudModel =
                                            "qwen-max";
                                        break;
                                    case "claude":
                                        this.plugin.settings.cloudEndpoint =
                                            endpoints.claude;
                                        this.plugin.settings.cloudModel =
                                            "claude-sonnet-4-5-20250929";
                                        break;
                                    case "groq":
                                        this.plugin.settings.cloudEndpoint =
                                            endpoints.groq;
                                        this.plugin.settings.cloudModel =
                                            "llama-3.3-70b-versatile";
                                        break;
                                    case "vertex":
                                        this.plugin.settings.cloudEndpoint =
                                            endpoints.vertex;
                                        this.plugin.settings.cloudModel =
                                            "gemini-2.0-flash";
                                        break;
                                    case "openrouter":
                                        this.plugin.settings.cloudEndpoint =
                                            endpoints.openrouter;
                                        this.plugin.settings.cloudModel =
                                            "openai/gpt-4o";
                                        break;
                                    case "bedrock":
                                        this.plugin.settings.cloudEndpoint =
                                            endpoints.bedrock;
                                        this.plugin.settings.cloudModel =
                                            "us.anthropic.claude-sonnet-4-0-v2:0";
                                        break;
                                    case "requesty":
                                        this.plugin.settings.cloudEndpoint =
                                            endpoints.requesty;
                                        this.plugin.settings.cloudModel =
                                            "gpt-4o";
                                        break;
                                    case "cohere":
                                        this.plugin.settings.cloudEndpoint =
                                            endpoints.cohere;
                                        this.plugin.settings.cloudModel =
                                            "command-r-plus";
                                        break;
                                    case "grok":
                                        this.plugin.settings.cloudEndpoint =
                                            endpoints.grok;
                                        this.plugin.settings.cloudModel =
                                            "grok-2-vision-1212";
                                        break;
                                    case "mistral":
                                        this.plugin.settings.cloudEndpoint =
                                            endpoints.mistral;
                                        this.plugin.settings.cloudModel =
                                            "mistral-large-latest";
                                        break;
                                    case "glm":
                                        this.plugin.settings.cloudEndpoint =
                                            endpoints.glm;
                                        this.plugin.settings.cloudModel =
                                            "glm-4-flash";
                                        break;
                                    case "mimo":
                                        this.plugin.settings.cloudEndpoint =
                                            endpoints.mimo;
                                        this.plugin.settings.cloudModel =
                                            "MiMo-V2-Flash";
                                        break;
                                    case "minimax":
                                        this.plugin.settings.cloudEndpoint =
                                            endpoints.minimax;
                                        this.plugin.settings.cloudModel =
                                            "MiniMax-M2.1";
                                        break;
                                    case "openai-compatible":
                                        this.plugin.settings.cloudEndpoint =
                                            "http://your-api-endpoint/v1/chat/completions";
                                        this.plugin.settings.cloudModel =
                                            "your-model";
                                        break;
                                }
                                await this.plugin.saveSettings();
                                this.settingTab.display();
                            } catch {
                                new Notice(
                                    this.plugin.t.messages
                                        .failedToLoadEndpoints,
                                );
                            }
                        }),
                );
        }
    }

    private displayLocalSettings(): void {
        new Setting(this.containerEl)
            .setName(this.plugin.t.settings.llm.localEndpoint)
            .setDesc(this.plugin.t.settings.llm.localEndpointDesc)
            .addText((text) => {
                text.setPlaceholder(
                    "http://localhost:11434/v1/chat/completions",
                ).setValue(this.plugin.settings.localEndpoint);

                // Only save/validate when user finishes editing (blur or Enter)
                const commitChange = async () => {
                    // Guard against blur firing on detached inputs (e.g. containerEl.empty() during re-render)
                    if (!text.inputEl.isConnected) return;
                    const value = text.getValue();
                    if (value !== this.plugin.settings.localEndpoint) {
                        this.plugin.settings.localEndpoint = value;
                        await this.plugin.saveSettings();
                        this.settingTab.display();
                        void this.checkLocalService(value);
                    }
                };

                text.inputEl.addEventListener("blur", () => {
                    void commitChange();
                });
                text.inputEl.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        text.inputEl.blur();
                    }
                });
            });

        new Setting(this.containerEl)
            .setName(this.plugin.t.settings.llm.modelName)
            .setDesc(this.plugin.t.settings.llm.modelNameDesc)
            .addText((text) =>
                text
                    .setPlaceholder(
                        "Model name (e.g., mistral, llama2, gpt-3.5-turbo)",
                    )
                    .setValue(this.plugin.settings.localModel)
                    .onChange(async (value) => {
                        this.plugin.settings.localModel = value;
                        await this.plugin.saveSettings();
                    }),
            );

        this.displayTemperatureOverrideSetting();

        // Add a tips section about common local LLM tools
        const tipsEl = this.containerEl.createDiv({
            cls: "ai-tagger-tips-block",
        });

        tipsEl.createEl("h3", {
            text: this.plugin.t.settings.llm.tipsPopularTools,
        });

        const tipsList = tipsEl.createEl("ul");
        tipsList.createEl("li", {
            text: `${this.plugin.t.dropdowns.ollama}: http://localhost:11434/v1/chat/completions`,
        });
        tipsList.createEl("li", {
            text: `${this.plugin.t.dropdowns.localai}: http://localhost:8080/v1/chat/completions`,
        });
        tipsList.createEl("li", {
            text: `${this.plugin.t.dropdowns.lmStudio}: http://localhost:1234/v1/chat/completions`,
        });
        tipsList.createEl("li", {
            text: `${this.plugin.t.dropdowns.jan}: http://localhost:1337/v1/chat/completions`,
        });
        tipsList.createEl("li", {
            text: `${this.plugin.t.dropdowns.koboldcpp}: http://localhost:5001/v1/chat/completions`,
        });

        // Styling comes from the .ai-tagger-tips-block CSS class

        this.createTestButton();
    }

    private displayTemperatureOverrideSetting(): void {
        new Setting(this.containerEl)
            .setName(this.plugin.t.settings.llm.temperature)
            .setDesc(this.plugin.t.settings.llm.temperatureDesc)
            .addText((text) => {
                text.setPlaceholder(
                    this.plugin.t.settings.llm.temperaturePlaceholder,
                ).setValue(
                    typeof this.plugin.settings.llmTemperatureOverride ===
                        "number"
                        ? String(this.plugin.settings.llmTemperatureOverride)
                        : "",
                );

                text.onChange(async (value) => {
                    if (this.isUpdatingTemperatureInput) {
                        return;
                    }

                    const trimmed = value.trim();
                    if (trimmed === "") {
                        this.plugin.settings.llmTemperatureOverride = null;
                        await this.plugin.saveSettings();
                        return;
                    }

                    const parsed = Number(trimmed);
                    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2) {
                        new Notice(
                            this.plugin.t.settings.llm.temperatureInvalid,
                        );
                        this.plugin.settings.llmTemperatureOverride = null;
                        await this.plugin.saveSettings();

                        this.isUpdatingTemperatureInput = true;
                        text.setValue("");
                        this.isUpdatingTemperatureInput = false;
                        return;
                    }

                    this.plugin.settings.llmTemperatureOverride = parsed;
                    await this.plugin.saveSettings();
                });

                return text;
            });
    }

    private createTestButton(): void {
        const testContainer = this.containerEl.createDiv(
            "connection-test-container",
        );

        const testSetting = new Setting(testContainer)
            .setName(this.plugin.t.settings.llm.connectionTest)
            .setDesc(this.plugin.t.settings.llm.connectionTestDesc);

        const buttonContainer = testSetting.settingEl.createDiv(
            "setting-item-control",
        );
        const button = new ButtonComponent(buttonContainer)
            .setButtonText(this.plugin.t.settings.llm.testConnection)
            .onClick(async () => {
                // Disable button during test
                button.setButtonText(this.plugin.t.settings.llm.testing);
                button.setDisabled(true);

                // Clear previous status
                if (this.statusContainer) {
                    this.statusContainer.show();
                    this.statusEl.textContent = "";
                    this.statusEl.className = "";
                }

                try {
                    const testResult =
                        await this.plugin.llmService.testConnection();

                    if (testResult.result === ConnectionTestResult.Success) {
                        this.setStatusMessage(
                            this.plugin.t.settings.llm.connectionSuccessful,
                            "success",
                        );
                    } else {
                        this.setStatusMessage(
                            `${this.plugin.t.settings.llm.connectionFailed}: ${testResult.error?.message || "Unknown error"}`,
                            "error",
                        );
                    }
                } catch (error) {
                    this.setStatusMessage(
                        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                        "error",
                    );
                } finally {
                    // Re-enable button
                    button.setButtonText(
                        this.plugin.t.settings.llm.testConnection,
                    );
                    button.setDisabled(false);
                }
            });

        this.statusContainer = testContainer.createDiv(
            "connection-test-status",
        );
        this.statusEl = this.statusContainer.createSpan();

        // Hide status container initially
        this.statusContainer.hide();
    }

    private displayCloudSettings(): void {
        new Setting(this.containerEl)
            .setName(this.plugin.t.settings.llm.apiEndpoint)
            .setDesc(this.plugin.t.settings.llm.apiEndpointDesc)
            .addText((text) => {
                const placeholder =
                    this.plugin.settings.cloudEndpoint ||
                    (this.plugin.settings.cloudServiceType ===
                    "openai-compatible"
                        ? "http://your-api-endpoint/v1/chat/completions"
                        : "");

                text.setPlaceholder(placeholder).setValue(
                    this.plugin.settings.cloudEndpoint,
                );

                text.onChange(async (value) => {
                    this.plugin.settings.cloudEndpoint = value;
                    await this.plugin.saveSettings();
                });

                return text;
            });

        new Setting(this.containerEl)
            .setName(this.plugin.t.settings.llm.apiKey)
            .setDesc(this.plugin.t.settings.llm.apiKeyDesc)
            .addText((text) => {
                text.setPlaceholder(
                    this.plugin.settings.cloudServiceType === "openai"
                        ? "sk-..."
                        : this.plugin.settings.cloudServiceType === "gemini"
                          ? "AIza..."
                          : this.plugin.settings.cloudServiceType === "deepseek"
                            ? "deepseek-..."
                            : this.plugin.settings.cloudServiceType === "aliyun"
                              ? "sk-..."
                              : this.plugin.settings.cloudServiceType ===
                                  "claude"
                                ? "sk-ant-..."
                                : this.plugin.settings.cloudServiceType ===
                                    "groq"
                                  ? "gsk_..."
                                  : this.plugin.settings.cloudServiceType ===
                                      "openrouter"
                                    ? "sk-or-..."
                                    : this.plugin.settings.cloudServiceType ===
                                        "bedrock"
                                      ? "aws-credentials"
                                      : this.plugin.settings
                                              .cloudServiceType === "requesty"
                                        ? "rq-..."
                                        : this.plugin.settings
                                                .cloudServiceType === "cohere"
                                          ? "co-..."
                                          : this.plugin.settings
                                                  .cloudServiceType === "grok"
                                            ? "grok-..."
                                            : this.plugin.settings
                                                    .cloudServiceType ===
                                                "mistral"
                                              ? "mist-..."
                                              : this.plugin.settings
                                                      .cloudServiceType ===
                                                  "openai-compatible"
                                                ? "your-api-key"
                                                : "Bearer oauth2-token",
                )
                    .setValue(this.plugin.settings.cloudApiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.cloudApiKey = value;
                        await this.plugin.saveSettings();
                    });
                // Mask API key by default for security
                text.inputEl.type = "password";
                text.inputEl.autocomplete = "off";
            })
            .addExtraButton((button) =>
                button
                    .setIcon("eye")
                    .setTooltip("Show/hide API key")
                    .onClick(() => {
                        const inputEl =
                            button.extraSettingsEl.parentElement?.querySelector(
                                "input",
                            );
                        if (inputEl) {
                            if (inputEl.type === "password") {
                                inputEl.type = "text";
                                button.setIcon("eye-off");
                            } else {
                                inputEl.type = "password";
                                button.setIcon("eye");
                            }
                        }
                    }),
            );

        new Setting(this.containerEl)
            .setName(this.plugin.t.settings.llm.modelName)
            .setDesc(this.plugin.t.settings.llm.modelNameDesc)
            .addText((text) =>
                text
                    .setPlaceholder(
                        this.plugin.settings.cloudServiceType === "openai"
                            ? "gpt-4o"
                            : this.plugin.settings.cloudServiceType === "gemini"
                              ? "gemini-2.0-flash"
                              : this.plugin.settings.cloudServiceType ===
                                  "deepseek"
                                ? "deepseek-chat"
                                : this.plugin.settings.cloudServiceType ===
                                    "aliyun"
                                  ? "qwen-max"
                                  : this.plugin.settings.cloudServiceType ===
                                      "claude"
                                    ? "claude-sonnet-4-5-20250929"
                                    : this.plugin.settings.cloudServiceType ===
                                        "groq"
                                      ? "llama-3.3-70b-versatile"
                                      : this.plugin.settings
                                              .cloudServiceType === "openrouter"
                                        ? "openai/gpt-4o"
                                        : this.plugin.settings
                                                .cloudServiceType === "bedrock"
                                          ? "us.anthropic.claude-sonnet-4-0-v2:0"
                                          : this.plugin.settings
                                                  .cloudServiceType ===
                                              "requesty"
                                            ? "gpt-4o"
                                            : this.plugin.settings
                                                    .cloudServiceType ===
                                                "cohere"
                                              ? "command-r-plus"
                                              : this.plugin.settings
                                                      .cloudServiceType ===
                                                  "grok"
                                                ? "grok-2-vision-1212"
                                                : this.plugin.settings
                                                        .cloudServiceType ===
                                                    "mistral"
                                                  ? "mistral-large-latest"
                                                  : this.plugin.settings
                                                          .cloudServiceType ===
                                                      "openai-compatible"
                                                    ? "your-model"
                                                    : "gemini-pro",
                    )
                    .setValue(this.plugin.settings.cloudModel)
                    .onChange(async (value) => {
                        this.plugin.settings.cloudModel = value;
                        await this.plugin.saveSettings();
                    }),
            );

        this.displayTemperatureOverrideSetting();

        this.createTestButton();
    }

    private setStatusMessage(
        message: string,
        status: "success" | "error",
    ): void {
        if (!this.statusContainer || !this.statusEl) return;

        this.statusContainer.show();
        this.statusContainer.className = "connection-test-status " + status;
        this.statusEl.textContent = message;
    }

    private async checkLocalService(endpoint: string): Promise<void> {
        const baseUrl = endpoint
            .trim()
            .replace(/\/$/, "")
            .replace(/\/v1\/chat\/completions$/, "");
        const checkUrl = `${baseUrl}/v1/models`;

        try {
            // throw:false keeps the previous fetch(!response.ok) semantics:
            // non-2xx response shows "not running", network failure shows "not available"
            const response = await requestUrl({
                url: checkUrl,
                method: "GET",
                headers: { "Content-Type": "application/json" },
                throw: false,
            });

            if (response.status < 200 || response.status >= 300) {
                new Notice(
                    this.plugin.t.messages.localServiceNotRunning,
                    10000,
                );
            }
        } catch {
            new Notice(this.plugin.t.messages.localServiceNotAvailable, 10000);
        }
    }
}
