import { App, PluginSettingTab } from "obsidian";
import type AITaggerPlugin from "../../main";
import { LLMSettingsSection } from "./LLMSettingsSection";
import { TaggingSettingsSection } from "./TaggingSettingsSection";
import { SupportSection } from "./SupportSection";
import { InterfaceSettingsSection } from "./InterfaceSettingsSection";
import { TagTemplatesSection } from "./TagTemplatesSection";

export class AITaggerSettingTab extends PluginSettingTab {
    private plugin: AITaggerPlugin;
    private llmSection?: LLMSettingsSection;
    private taggingSection?: TaggingSettingsSection;
    private supportSection?: SupportSection;
    private interfaceSection?: InterfaceSettingsSection;
    private tagTemplatesSection?: TagTemplatesSection;

    constructor(app: App, plugin: AITaggerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass("ai-tagger-settings");

        // Initialize all sections
        this.llmSection = new LLMSettingsSection(
            this.plugin,
            containerEl,
            this,
        );
        this.taggingSection = new TaggingSettingsSection(
            this.plugin,
            containerEl,
            this,
        );
        this.tagTemplatesSection = new TagTemplatesSection(
            this.plugin,
            containerEl,
            this,
        );
        this.supportSection = new SupportSection(
            this.plugin,
            containerEl,
            this,
        );
        this.interfaceSection = new InterfaceSettingsSection(
            this.plugin,
            containerEl,
            this,
        );

        // Display all sections
        this.llmSection.display();
        this.taggingSection.display();
        this.tagTemplatesSection.display();
        this.interfaceSection.display();
        this.supportSection.display();
    }
}
