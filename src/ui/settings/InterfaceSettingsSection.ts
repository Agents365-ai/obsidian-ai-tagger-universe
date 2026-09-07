import { Setting } from "obsidian";
import { BaseSettingSection } from "./BaseSettingSection";
import { getLanguageOptions, type SupportedLanguage } from "../../i18n";

export class InterfaceSettingsSection extends BaseSettingSection {
    display(): void {
        this.containerEl.createEl("h1", {
            text: this.plugin.t.settings.interface.title,
        });

        new Setting(this.containerEl)
            .setName(this.plugin.t.settings.interface.language)
            .setDesc(this.plugin.t.settings.interface.languageDesc)
            .addDropdown((dropdown) => {
                const options = getLanguageOptions();

                return dropdown
                    .addOptions(options)
                    .setValue(this.plugin.settings.interfaceLanguage)
                    .onChange(async (value) => {
                        this.plugin.settings.interfaceLanguage =
                            value as SupportedLanguage;
                        await this.plugin.saveSettings();

                        // Show restart required notice (remove any previous one first)
                        const existingNotice =
                            this.containerEl.querySelector(".language-notice");
                        if (existingNotice) {
                            existingNotice.remove();
                        }

                        const notice = this.containerEl.createDiv(
                            "notice language-notice",
                        );
                        const noticeContent = notice.createDiv(
                            "language-notice-content",
                        );
                        noticeContent.createSpan({
                            text: "ℹ️",
                            cls: "language-notice-icon",
                        });
                        noticeContent.createSpan({
                            text: this.plugin.t.messages.restartRequired,
                        });

                        // Auto-remove notice after 5 seconds
                        window.setTimeout(() => {
                            notice.remove();
                        }, 5000);
                    });
            });

        // Add restart notice
        const restartNotice = this.containerEl.createDiv("language-notice");
        const restartContent = restartNotice.createDiv(
            "language-notice-content",
        );
        restartContent.createSpan({ text: "💡", cls: "language-notice-icon" });
        restartContent.createSpan({
            text: this.plugin.t.messages.languageChangeNotice,
        });
    }
}
