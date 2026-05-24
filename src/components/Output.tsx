import { useEffect, useRef, useState } from "react";

import type { Embed, EmbedField } from "../lib/interfaces";
import { embedToObjectCode } from "../lib/utils";
import Highlight from "./Highlight";

function s(strings: TemplateStringsArray, ...values: unknown[]) {
let escaped = "";

for (let i = 0; i < strings.length; i++) {
if (i > 0) {
escaped += JSON.stringify(`${values[i - 1]}`);
}
escaped += strings[i];
}

return escaped;
}

const sampleGuild = (() => {
const seed = Math.floor(Math.random() * 1000000);
const memberCount = Math.floor(Math.random() * 90000) + 1000;
const premiumSubscriptionCount = Math.floor(Math.random() * 180) + 1;
const createdTimestamp =
Date.now() - (Math.floor(Math.random() * 2200) + 200) * 86400000;

return {
memberCount,
premiumSubscriptionCount,
createdTimestamp,
iconURL: ({ size = 128 }: { size?: number } = {}) =>
`https://picsum.photos/seed/guild-icon-${seed}-${size}/${size}/${size}`
};
})();

function normalizeColor(value: unknown): string | undefined {
if (typeof value === "number" && Number.isFinite(value)) {
return `#${Math.max(0, Math.min(value, 0xffffff))
.toString(16)
.padStart(6, "0")}`;
}

if (typeof value !== "string") return undefined;
const trimmed = value.trim();
if (!trimmed) return undefined;
if (trimmed.startsWith("#")) return trimmed;
if (/^0x/i.test(trimmed)) {
const parsed = Number.parseInt(trimmed, 16);
if (Number.isFinite(parsed)) {
return `#${Math.max(0, Math.min(parsed, 0xffffff))
.toString(16)
.padStart(6, "0")}`;
}
}
return trimmed;
}

function readImageUrl(value: unknown): string {
if (typeof value === "string") return value;
if (
value &&
typeof value === "object" &&
"url" in value &&
typeof (value as { url?: unknown }).url === "string"
) {
return (value as { url: string }).url;
}
return "";
}

function normalizeFields(fields: unknown): EmbedField[] {
if (!Array.isArray(fields)) return [];

return fields
.map(field => {
if (Array.isArray(field)) {
return {
name: String(field[0] ?? ""),
value: String(field[1] ?? ""),
inline: !!field[2]
};
}

if (!field || typeof field !== "object") return null;
const maybeField = field as {
name?: unknown;
value?: unknown;
inline?: unknown;
};
return {
name: String(maybeField.name ?? ""),
value: String(maybeField.value ?? ""),
inline: !!maybeField.inline
};
})
.filter((field): field is EmbedField => !!field);
}

function normalizeEmbed(input: unknown): Embed {
const source =
input && typeof input === "object"
? (input as Record<string, unknown>)
: {};
const author =
source.author && typeof source.author === "object"
? (source.author as Record<string, unknown>)
: {};
const footer =
source.footer && typeof source.footer === "object"
? (source.footer as Record<string, unknown>)
: {};

const timestampSource = source.timestamp;
let timestamp: number | undefined;
if (typeof timestampSource === "number" && Number.isFinite(timestampSource)) {
timestamp = timestampSource;
} else if (timestampSource instanceof Date) {
timestamp = timestampSource.getTime();
} else if (typeof timestampSource === "string" && timestampSource.trim()) {
const parsed = Date.parse(timestampSource);
if (!Number.isNaN(parsed)) timestamp = parsed;
}

return {
title: String(source.title ?? ""),
description: String(source.description ?? ""),
url: String(source.url ?? ""),
timestamp,
color: normalizeColor(source.color),
image: readImageUrl(source.image),
thumbnail: readImageUrl(source.thumbnail),
footer: {
text: String(footer.text ?? ""),
iconUrl: String(footer.iconUrl ?? footer.icon_url ?? "")
},
author: {
name: String(author.name ?? ""),
url: String(author.url ?? ""),
iconUrl: String(author.iconUrl ?? author.icon_url ?? author.iconURL ?? "")
},
fields: normalizeFields(source.fields)
};
}

class MockEmbedBuilder {
data: Record<string, unknown> = {};

setAuthor(nameOrAuthor: unknown, iconURL?: unknown, url?: unknown) {
if (nameOrAuthor && typeof nameOrAuthor === "object") {
this.data.author = {
...(this.data.author as Record<string, unknown>),
...(nameOrAuthor as Record<string, unknown>)
};
} else {
this.data.author = {
name: nameOrAuthor,
iconURL,
url
};
}
return this;
}

setTitle(title: unknown) {
this.data.title = title;
return this;
}

setURL(url: unknown) {
this.data.url = url;
return this;
}

setDescription(description: unknown) {
this.data.description = description;
return this;
}

addField(name: unknown, value: unknown, inline?: unknown) {
const fields = (this.data.fields as unknown[]) || [];
fields.push({ name, value, inline: !!inline });
this.data.fields = fields;
return this;
}

addFields(...fields: unknown[]) {
const existing = (this.data.fields as unknown[]) || [];
const normalized: unknown[] = [];
for (const field of fields) {
if (Array.isArray(field)) normalized.push(...field);
else normalized.push(field);
}
this.data.fields = [...existing, ...normalized];
return this;
}

setImage(image: unknown) {
this.data.image = image;
return this;
}

setThumbnail(thumbnail: unknown) {
this.data.thumbnail = thumbnail;
return this;
}

setColor(color: unknown) {
this.data.color = color;
return this;
}

setFooter(textOrFooter: unknown, iconURL?: unknown) {
if (textOrFooter && typeof textOrFooter === "object") {
this.data.footer = {
...(this.data.footer as Record<string, unknown>),
...(textOrFooter as Record<string, unknown>)
};
} else {
this.data.footer = { text: textOrFooter, iconURL };
}
return this;
}

setTimestamp(timestamp?: unknown) {
this.data.timestamp = timestamp === undefined ? Date.now() : timestamp;
return this;
}

toJSON() {
return this.data;
}
}

async function parseDiscordJs(code: string): Promise<Embed> {
const AsyncFunction: new (...args: string[]) => (
...args: unknown[]
) => Promise<unknown> = Object.getPrototypeOf(async function () {})
.constructor;

let repliedEmbed: unknown;

const runner = new AsyncFunction(
"defaultEmbed",
"EmbedBuilder",
"MessageEmbed",
"guild",
"message",
"Math",
"window",
"document",
"globalThis",
"fetch",
`${code}\nreturn typeof embed !== \"undefined\" ? embed : undefined;`
);

const message = {
reply: async (value: unknown) => {
if (
value &&
typeof value === "object" &&
"embeds" in value &&
Array.isArray((value as { embeds?: unknown[] }).embeds)
) {
repliedEmbed = (value as { embeds: unknown[] }).embeds[0];
}
return value;
}
};

const result = await runner(
() => new MockEmbedBuilder(),
MockEmbedBuilder,
MockEmbedBuilder,
sampleGuild,
message,
Math,
undefined,
undefined,
undefined,
undefined
);

const embedSource =
result && typeof result === "object" && "toJSON" in result
? (result as { toJSON: () => unknown }).toJSON()
: result || repliedEmbed;

if (!embedSource) {
throw new Error("No embed variable found in code.");
}

return normalizeEmbed(embedSource);
}

function generateOutput(
embed: Embed,
language: "json" | "js" | "py" | "rs",
jsVersion: string,
jsMode: string,
rsMode: string,
rsFields: string
): string {
let output = "";

if (language === "json") {
output = embedToObjectCode(embed, false);
} else if (language === "js") {
if (jsMode !== "object") {
output += `const embed = new ${
jsVersion === "13" ? "MessageEmbed" : "EmbedBuilder"
}()`;

const steps = [""];

if (embed.author.name || embed.author.url || embed.author.iconUrl) {
const substeps = [".setAuthor({"];

if (embed.author.name)
substeps.push(s`  name: ${embed.author.name},`);
if (embed.author.url)
substeps.push(s`  url: ${embed.author.url},`);
if (embed.author.iconUrl)
substeps.push(s`  iconURL: ${embed.author.iconUrl},`);
substeps.push(`})`);

steps.push(substeps.join(jsMode === "chained" ? "\n  " : "\n"));
}

if (embed.title) steps.push(s`.setTitle(${embed.title})`);

if (embed.url) steps.push(s`.setURL(${embed.url})`);

if (embed.description)
steps.push(s`.setDescription(${embed.description})`);

if (embed.fields.length > 0) {
const substeps = [".addFields("];

for (const field of embed.fields) {
substeps.push(`  {`);
substeps.push(s`    name: ${field.name},`);
substeps.push(s`    value: ${field.value},`);
if (field.inline) substeps.push(`    inline: true`);
else substeps.push(`    inline: false`);
substeps.push(`  },`);
}
substeps.push(`)`);

steps.push(substeps.join(jsMode === "chained" ? "\n  " : "\n"));
}

if (embed.image) steps.push(s`.setImage(${embed.image})`);

if (embed.thumbnail) steps.push(s`.setThumbnail(${embed.thumbnail})`);

if (embed.color) steps.push(s`.setColor(${embed.color})`);

if (embed.footer.text || embed.footer.iconUrl) {
const substeps = [".setFooter({"];

if (embed.footer.text)
substeps.push(s`  text: ${embed.footer.text},`);
if (embed.footer.iconUrl)
substeps.push(s`  iconURL: ${embed.footer.iconUrl},`);
substeps.push(`})`);

steps.push(substeps.join(jsMode === "chained" ? "\n  " : "\n"));
}

if (embed.timestamp) steps.push(`.setTimestamp()`);

output += steps.join(jsMode === "chained" ? "\n  " : ";\nembed");

output += `;\n\nawait message.reply({ embeds: [embed] });`;
} else {
output += `await message.reply({\n`;
output += `  embeds: [${embedToObjectCode(embed).replaceAll(
"\n",
"\n  "
)}]\n`;
output += `});\n`;
}
} else if (language === "py") {
output += `embed = discord.Embed(`;

const kwargs = [];

if (embed.title) kwargs.push(s`title=${embed.title}`);
if (embed.url) kwargs.push(s`url=${embed.url}`);
if (embed.description) kwargs.push(s`description=${embed.description}`);
if (embed.color) kwargs.push(`colour=${embed.color.replace("#", "0x")}`);
if (embed.timestamp) kwargs.push(`timestamp=datetime.now()`);

output += `${kwargs.join(",\n                      ")})\n`;

if (embed.author.name || embed.author.url || embed.author.iconUrl) {
output += `\nembed.set_author(`;

const kwargs = [];

if (embed.author.name) kwargs.push(s`name=${embed.author.name}`);
if (embed.author.url) kwargs.push(s`url=${embed.author.url}`);
if (embed.author.iconUrl)
kwargs.push(s`icon_url=${embed.author.iconUrl}`);

output += `${kwargs.join(`,\n                 `)})\n`;
}

if (embed.fields.length > 0) {
for (const field of embed.fields) {
output += s`\nembed.add_field(name=${field.name},\n`;
output += s`                value=${field.value}`;
if (field.inline) output += `,\n                inline=True`;
else output += `,\n                inline=False`;
output += ")";
}
output += "\n";
}

if (embed.image) output += s`\nembed.set_image(url=${embed.image})\n`;

if (embed.thumbnail)
output += s`\nembed.set_thumbnail(url=${embed.thumbnail})\n`;

if (embed.footer.text || embed.footer.iconUrl) {
output += `\nembed.set_footer(`;

if (embed.footer.text) output += s`text=${embed.footer.text}`;
if (embed.footer.iconUrl) {
if (embed.footer.text) output += `,\n                 `;
output += s`icon_url=${embed.footer.iconUrl}`;
}
output += `)\n`;
}

output += `\nawait ctx.send(embed=embed)`;
} else if (language === "rs") {
output =
"// You may need to import additional things to make this work\n\n";

output +=
rsMode === "variable"
? `let embed = CreateEmbed::default()`
: "let msg = msg\n    .channel_id\n    .send_message(&ctx.http, |m| {\n        m.embed(|e| {\n            e";

const steps = rsMode === "variable" ? [""] : [];

const substepsSeparator =
rsMode === "variable" ? "\n        " : "\n                    ";

if (embed.title) steps.push(s`.title(${embed.title})`);
if (embed.url) steps.push(s`.url(${embed.url})`);
if (embed.description) steps.push(s`.description(${embed.description})`);
if (embed.color)
steps.push(`.color(Colour::new(${embed.color.replace("#", "0x")}))`);
if (embed.timestamp) steps.push(`.timestamp(Timestamp::now())`);

if (embed.author.name || embed.author.url || embed.author.iconUrl) {
const first = `.author(|a| {${substepsSeparator}a`;
const substeps = [];

if (embed.author.name) substeps.push(s`.name(${embed.author.name})`);
if (embed.author.url) substeps.push(s`.url(${embed.author.url})`);
if (embed.author.iconUrl)
substeps.push(s`.icon_url(${embed.author.iconUrl})`);

steps.push(first + substeps.join(substepsSeparator + "    "), `})`);
}

if (embed.fields.length > 0) {
if (rsFields === "together") {
const substeps = [`.fields(vec![`];

for (const field of embed.fields) {
substeps.push(s`(${field.name}, ${field.value}, `);
if (field.inline) substeps[substeps.length - 1] += `true)`;
else substeps[substeps.length - 1] += `false)`;
}

steps.push(substeps.join(substepsSeparator), `])`);
} else {
for (const field of embed.fields) {
steps.push(s`.field(${field.name}, ${field.value}, `);
if (field.inline) steps[steps.length - 1] += `true)`;
else steps[steps.length - 1] += `false)`;
}
}
}

if (embed.image) steps.push(s`.image(${embed.image})`);

if (embed.thumbnail) steps.push(s`.thumbnail(${embed.thumbnail})`);

if (embed.footer.text || embed.footer.iconUrl) {
const first = `.footer(|f| {${substepsSeparator}f`;
const substeps = [];

if (embed.footer.text) substeps.push(s`.text(${embed.footer.text})`);
if (embed.footer.iconUrl)
substeps.push(s`.icon_url(${embed.footer.iconUrl})`);

steps.push(first + substeps.join(substepsSeparator + "    "), `})`);
}

output += steps.join(rsMode === "variable" ? "\n    " : "\n                ");

if (rsMode === "closure") {
output += `\n        })\n    })\n    .await;`;
} else {
output += `;\n\nlet msg = msg\n    .channel_id\n    .send_message(&ctx.http, |m| m.set_embed(embed))\n    .await;`;
}
}

return output;
}

export default function Output({
embed,
onEmbedChange
}: {
embed: Embed;
onEmbedChange: (embed: Embed) => void;
}) {
const [language, setLanguage] = useState<"json" | "js" | "py" | "rs">("js");
const [jsVersion, setJsVersion] = useState("14");
const [jsMode, setJsMode] = useState("chained");
const [rsMode, setRsMode] = useState("variable");
const [rsFields, setRsFields] = useState("together");
const [editorValue, setEditorValue] = useState("");
const [editorError, setEditorError] = useState("");
const parseVersion = useRef(0);

const output = generateOutput(embed, language, jsVersion, jsMode, rsMode, rsFields);
const editableWithPreview = language === "json" || language === "js";

useEffect(() => {
setEditorValue(output);
setEditorError("");
}, [output, language, jsVersion, jsMode, rsMode, rsFields]);

function updateFromJson(value: string) {
try {
onEmbedChange(normalizeEmbed(JSON.parse(value)));
setEditorError("");
} catch {
setEditorError("Invalid JSON. Fix syntax to update preview.");
}
}

function updateFromJs(value: string) {
const current = ++parseVersion.current;

void parseDiscordJs(value)
.then(parsed => {
if (parseVersion.current !== current) return;
onEmbedChange(parsed);
setEditorError("");
})
.catch(() => {
if (parseVersion.current !== current) return;
setEditorError(
"Invalid discord.js snippet. Keep editing to update preview."
);
});
}

return (
<div className="mt-8">
<h2 className="text-xl font-semibold text-white">Output</h2>

<div className="flex my-2 gap-2">
<select
name="language"
id="language"
value={language}
onChange={e => setLanguage(e.target.value as "js" | "py")}
>
<option value="json">JSON representation</option>
<option value="js">discord.js</option>
<option value="py">discord.py</option>
<option value="rs">serenity (rust)</option>
</select>

{language === "js" ? (
<>
<select
name="version"
id="version"
value={jsVersion}
onChange={e => setJsVersion(e.target.value)}
>
<option value="13">v13</option>
<option value="14">v14</option>
</select>

<select
name="mode"
id="mode"
value={jsMode}
onChange={e => setJsMode(e.target.value)}
>
<option value="chained">Builder (Chained)</option>
<option value="split">Builder (Split)</option>
<option value="object">Object</option>
</select>
</>
) : null}

{language === "rs" ? (
<>
<select
name="mode"
id="mode"
value={rsMode}
onChange={e => setRsMode(e.target.value)}
>
<option value="variable">Separate Variable</option>
<option value="closure">In a Closure</option>
</select>

<select
name="fields"
id="fields"
value={rsFields}
onChange={e => setRsFields(e.target.value)}
>
<option value="together">Fields Together</option>
<option value="separate">Fields Separate</option>
</select>
</>
) : null}
</div>

{editableWithPreview ? (
<textarea
value={editorValue}
onChange={e => {
const value = e.target.value;
setEditorValue(value);
if (language === "json") updateFromJson(value);
else updateFromJs(value);
}}
spellCheck={false}
className="w-full min-h-[22rem] rounded text-sm p-4 bg-[#282c34] text-[#abb2bf] border border-[#202225] focus:outline-none focus:border-[#40444b]"
style={{
fontFamily:
'"Consolas","Andale Mono WT","Andale Mono","Lucida Console","Lucida Sans Typewriter","DejaVu Sans Mono","Bitstream Vera Sans Mono","Liberation Mono","Nimbus Mono L","Monaco","Courier New","Courier","monospace"'
}}
/>
) : (
<Highlight language={language} className="rounded text-sm">
{output}
</Highlight>
)}

{editorError ? (
<p className="mt-2 text-sm text-[#fca5a5]">{editorError}</p>
) : null}
</div>
);
}
