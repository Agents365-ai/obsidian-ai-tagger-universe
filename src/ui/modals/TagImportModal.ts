import { App, Modal, ButtonComponent, Setting, Notice } from 'obsidian';
import { Translations } from '../../i18n/types';
import { TagImportExport } from '../../utils/tagImportExport';
import { TagFormat } from '../../core/settings';

export class TagImportModal extends Modal {
    private t: Translations;
    private tagFormat: TagFormat;
    private tagImportExport: TagImportExport;
    private fileContent: string | null = null;
    private fileType: 'json' | 'csv' | null = null;
    private importMode: 'merge' | 'replace' = 'merge';
    private onSuccess?: () => void;

    constructor(app: App, t: Translations, tagFormat: TagFormat, onSuccess?: () => void) {
        super(app);
        this.t = t;
        this.tagFormat = tagFormat;
        this.tagImportExport = new TagImportExport(app);
        this.onSuccess = onSuccess;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('tag-import-modal');

        contentEl.createEl('h3', { text: this.t.tagImportExport.importTitle });

        // File input
        new Setting(contentEl)
            .setName(this.t.tagImportExport.selectFile)
            .addButton(btn => {
                btn.setButtonText(this.t.tagImportExport.selectFile)
                    .onClick(() => this.selectFile());
            });

        const fileInfoEl = contentEl.createDiv({ cls: 'tag-import-file-info' });
        fileInfoEl.setText('No file selected');

        // Import mode
        new Setting(contentEl)
            .setName(this.t.tagImportExport.importMode)
            .addDropdown(dropdown => {
                dropdown
                    .addOption('merge', this.t.tagImportExport.modeMerge)
                    .addOption('replace', this.t.tagImportExport.modeReplace)
                    .setValue(this.importMode)
                    .onChange(value => {
                        this.importMode = value as 'merge' | 'replace';
                    });
            });

        // Buttons
        const buttonContainer = contentEl.createDiv({ cls: 'tag-import-buttons' });

        new ButtonComponent(buttonContainer)
            .setButtonText(this.t.modals.cancel)
            .onClick(() => this.close());

        new ButtonComponent(buttonContainer)
            .setButtonText(this.t.tagImportExport.import)
            .setCta()
            .onClick(() => this.handleImport());
    }

    private selectFile(): void {
        const input = createEl('input');
        input.type = 'file';
        input.accept = '.json,.csv';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                this.fileContent = event.target?.result as string;
                this.fileType = file.name.endsWith('.json') ? 'json' : 'csv';

                const fileInfoEl = this.contentEl.querySelector('.tag-import-file-info');
                if (fileInfoEl) {
                    fileInfoEl.setText(`Selected: ${file.name}`);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    private async handleImport(): Promise<void> {
        if (!this.fileContent || !this.fileType) {
            new Notice(this.t.tagImportExport.noFileSelected);
            return;
        }

        new Notice(this.t.tagImportExport.importing);

        try {
            let result;
            if (this.fileType === 'json') {
                result = await this.tagImportExport.importFromJSON(
                    this.fileContent,
                    this.importMode,
                    this.tagFormat
                );
            } else {
                result = await this.tagImportExport.importFromCSV(
                    this.fileContent,
                    this.importMode,
                    this.tagFormat
                );
            }

            const message = this.t.tagImportExport.importSuccess
                .replace('{success}', String(result.success))
                .replace('{skipped}', String(result.skipped))
                .replace('{failed}', String(result.failed));

            new Notice(message);
            this.onSuccess?.();
            this.close();
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            new Notice(`${this.t.tagImportExport.importError}: ${msg}`);
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
