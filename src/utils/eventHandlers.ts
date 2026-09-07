import { type App, MarkdownView, type EventRef } from "obsidian";

export class EventHandlers {
    private app: App;
    private trackedRefs: EventRef[] = [];
    private isRegistered: boolean = false;

    constructor(app: App) {
        this.app = app;
    }

    registerEventHandlers() {
        // Prevent duplicate registration
        if (this.isRegistered) {
            return;
        }
        this.isRegistered = true;

        // Obsidian handles file changes; never synthesize file-open events.
        // Handle layout changes (workspace event)
        const layoutRef = this.app.workspace.on("layout-change", () => {
            // Refresh any active editor views
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (view?.getMode() === "source") {
                view.editor.refresh();
            }
        });
        this.trackedRefs.push(layoutRef);
    }

    cleanup() {
        for (const ref of this.trackedRefs) {
            this.app.workspace.offref(ref);
        }
        this.trackedRefs = [];
        this.isRegistered = false;
    }
}
