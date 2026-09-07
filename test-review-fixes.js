// Run with: node test-review-fixes.js
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { buildSync } = require("esbuild");

const code = buildSync({
    stdin: {
        contents: `
            export { fetchLocalModels } from './src/services/localModelFetcher';
            export { SiliconflowAdapter } from './src/services/adapters/siliconflowAdapter';
            export { TagImportExport } from './src/utils/tagImportExport';
            export { TagUtils } from './src/utils/tagUtils';
        `,
        resolveDir: __dirname,
    },
    bundle: true,
    platform: "browser",
    format: "cjs",
    external: ["obsidian"],
    write: false,
}).outputFiles[0].text;

class TFile {
    constructor(path) {
        this.path = path;
        this.extension = "md";
    }
}
const requests = [];
let responses = [];
const obsidian = new Proxy(
    {
        TFile,
        // JSON is a YAML subset; stand in for the native YAML API, not a YAML parser test.
        parseYaml: JSON.parse,
        stringifyYaml: JSON.stringify,
        requestUrl: async (options) => {
            requests.push(options);
            assert.equal(options.throw, false);
            assert.ok(responses.length, "Unexpected network request");
            const response = responses.shift();
            if (response instanceof Error) throw response;
            return response;
        },
    },
    { get: (target, key) => target[key] || class {} },
);
const context = {
    module: { exports: {} },
    require: (name) => {
        assert.equal(name, "obsidian");
        return obsidian;
    },
    URL,
    Error,
    console,
    btoa: (text) => Buffer.from(text).toString("base64"),
    setTimeout: (callback) => {
        callback();
        return 1;
    },
    clearTimeout: () => {},
};
context.window = context;
vm.runInNewContext(code, context);
const { fetchLocalModels, SiliconflowAdapter, TagImportExport, TagUtils } =
    context.module.exports;

function parseJson(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        assert.fail(`Invalid JSON output from plugin code: ${error}`);
    }
}

async function main() {
    responses = [
        { status: 404 },
        { status: 200, json: { models: [{ name: "llama" }] } },
    ];
    assert.equal(
        (await fetchLocalModels("http://localhost:11434")).join(","),
        "llama",
    );
    assert.deepEqual(
        requests.map((r) => r.url),
        ["http://localhost:11434/api/tags", "http://localhost:11434/api/list"],
    );

    requests.length = 0;
    responses = [{ status: 200, json: { data: [{ id: "model-a" }] } }];
    assert.equal(
        (await fetchLocalModels("http://user:pass@localhost:1234/v1")).join(
            ",",
        ),
        "model-a",
    );
    assert.equal(requests[0].url, "http://localhost:1234/v1/models");
    assert.equal(requests[0].headers.Authorization, "Basic dXNlcjpwYXNz");
    responses = [new Error("Offline")];
    assert.equal(
        (await fetchLocalModels("http://localhost:1234/v1")).length,
        0,
    );
    responses = [{ status: 401 }];
    assert.equal(
        (await fetchLocalModels("http://localhost:1234/v1")).length,
        0,
    );
    responses = [
        {
            status: 200,
            get json() {
                throw new Error("Invalid JSON");
            },
        },
    ];
    assert.equal(
        (await fetchLocalModels("http://localhost:1234/v1")).length,
        0,
    );

    const adapter = new SiliconflowAdapter({
        endpoint: "https://api.siliconflow.cn",
        modelName: "test-model",
        apiKey: "test-key",
    });
    responses = [{ status: 200 }];
    assert.equal((await adapter.testConnection()).result.success, true);
    const request = requests.at(-1);
    assert.equal(request.method, "POST");
    assert.equal(request.headers.Authorization, "Bearer test-key");
    assert.equal(parseJson(request.body).model, "test-model");
    responses = [{ status: 401, json: { error: { message: "Invalid key" } } }];
    assert.equal((await adapter.testConnection()).error, "Invalid key");
    responses = [
        {
            status: 502,
            get json() {
                throw new Error("Not JSON");
            },
        },
    ];
    assert.equal(
        (await adapter.testConnection()).error,
        "Connection test failed",
    );

    const file = new TFile("note.md");
    const originalFields = {
        title: "Keep this",
        nested: { value: 42 },
        tags: ["old"],
    };
    let content = "";
    let writes = 0;
    const app = {
        vault: {
            getAbstractFileByPath: () => file,
            read: async () => content,
            modify: async (_, value) => {
                content = value;
                writes++;
            },
        },
        metadataCache: {
            getFileCache: () => ({
                frontmatter: originalFields,
                frontmatterPosition: {
                    start: { offset: 0 },
                    end: { offset: content.indexOf("\n---", 4) + 4 },
                },
            }),
        },
    };
    const importer = new TagImportExport(app);
    for (const update of [
        async () =>
            (
                await importer.importFromJSON(
                    JSON.stringify({
                        entries: [{ path: file.path, tags: ["new"] }],
                    }),
                    "replace",
                    "kebab-case",
                )
            ).failed === 0,
        async () =>
            (await TagUtils.updateNoteTags(app, file, ["new"], [], true))
                .success,
    ]) {
        content = `---\n${JSON.stringify(originalFields)}\n---\nBody`;
        writes = 0;
        assert.equal(await update(), true);
        assert.equal(writes, 1);
        const fields = parseJson(content.slice(4, content.indexOf("\n---", 4)));
        assert.equal(fields.title, originalFields.title);
        assert.deepEqual(fields.nested, originalFields.nested);
        assert.deepEqual(fields.tags, ["new"]);
        assert.ok(content.endsWith("\nBody"));
        for (const invalid of ["[", "[]", '"scalar"']) {
            content = `---\n${invalid}\n---\nBody`;
            const before = content;
            writes = 0;
            assert.equal(await update(), false);
            assert.equal(
                writes,
                0,
                "Invalid frontmatter must never be overwritten",
            );
            assert.equal(content, before);
        }
    }
    console.log("Review regression checks passed.");
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
