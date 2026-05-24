import { useEffect, useState } from "react";

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
const DAY_IN_MS = 86_400_000;
const createdTimestamp =
Date.now() - (Math.floor(Math.random() * 2200) + 200) * DAY_IN_MS;

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

function findMatchingDelimiter(
input: string,
openIndex: number,
openChar: "(" | "{" | "[",
closeChar: ")" | "}" | "]"
): number {
let depth = 0;
let quote: "'" | '"' | "`" | null = null;
let escape = false;

for (let i = openIndex; i < input.length; i++) {
const char = input[i];

if (quote) {
if (escape) {
escape = false;
continue;
}
if (char === "\\") {
escape = true;
continue;
}
if (char === quote) {
quote = null;
}
continue;
}

if (char === "'" || char === '"' || char === "`") {
quote = char;
continue;
}

if (char === openChar) depth++;
if (char === closeChar) depth--;

if (depth === 0) return i;
}

return -1;
}

function splitTopLevelArgs(input: string): string[] {
const parts: string[] = [];
let start = 0;
let paren = 0;
let brace = 0;
let bracket = 0;
let quote: "'" | '"' | "`" | null = null;
let escape = false;

for (let i = 0; i < input.length; i++) {
const char = input[i];

if (quote) {
if (escape) {
escape = false;
continue;
}
if (char === "\\") {
escape = true;
continue;
}
if (char === quote) quote = null;
continue;
}

if (char === "'" || char === '"' || char === "`") {
quote = char;
continue;
}

if (char === "(") paren++;
else if (char === ")") paren--;
else if (char === "{") brace++;
else if (char === "}") brace--;
else if (char === "[") bracket++;
else if (char === "]") bracket--;
else if (char === "," && paren === 0 && brace === 0 && bracket === 0) {
parts.push(input.slice(start, i).trim());
start = i + 1;
}
}

const last = input.slice(start).trim();
if (last) parts.push(last);
return parts;
}

function findMethodCalls(code: string, methodName: string): string[] {
const calls: string[] = [];
let start = 0;
const signature = `${methodName}(`;

while (true) {
const index = code.indexOf(signature, start);
if (index === -1) break;

const openIndex = index + signature.length - 1;
const closeIndex = findMatchingDelimiter(code, openIndex, "(", ")");
if (closeIndex === -1) break;

calls.push(code.slice(openIndex + 1, closeIndex).trim());
start = closeIndex + 1;
}

return calls;
}

function extractObjectLiterals(input: string): string[] {
const objects: string[] = [];
let i = 0;

while (i < input.length) {
if (input[i] !== "{") {
i++;
continue;
}

const end = findMatchingDelimiter(input, i, "{", "}");
if (end === -1) break;
objects.push(input.slice(i, end + 1));
i = end + 1;
}

return objects;
}

function extractPropertyValue(objectCode: string, key: string): string | undefined {
const regex = new RegExp(`\\b${key}\\s*:`, "g");
const match = regex.exec(objectCode);
if (!match) return undefined;

let i = match.index + match[0].length;
while (i < objectCode.length && /\s/.test(objectCode[i])) i++;

let paren = 0;
let brace = 0;
let bracket = 0;
let quote: "'" | '"' | "`" | null = null;
let escape = false;
let end = i;

for (; end < objectCode.length; end++) {
const char = objectCode[end];

if (quote) {
if (escape) {
escape = false;
continue;
}
if (char === "\\") {
escape = true;
continue;
}
if (char === quote) quote = null;
continue;
}

if (char === "'" || char === '"' || char === "`") {
quote = char;
continue;
}

if (char === "(") paren++;
else if (char === ")") paren--;
else if (char === "{") brace++;
else if (char === "}") {
if (brace === 0 && paren === 0 && bracket === 0) break;
brace--;
}
else if (char === "[") bracket++;
else if (char === "]") bracket--;
else if (char === "," && paren === 0 && brace === 0 && bracket === 0) break;
}

return objectCode.slice(i, end).trim();
}

function resolveKnownExpression(value: string): string | number | undefined {
const compact = value.replace(/\s+/g, "");
if (compact === "guild.memberCount") return sampleGuild.memberCount;
if (compact === "guild.premiumSubscriptionCount")
return sampleGuild.premiumSubscriptionCount;
if (compact === "guild.createdTimestamp") return sampleGuild.createdTimestamp;
if (compact === "Math.floor(guild.createdTimestamp/1000)") {
return Math.floor(sampleGuild.createdTimestamp / 1000);
}
if (/^guild\.iconURL\(\{.*\}\)$/.test(compact)) {
const sizeMatch = compact.match(/size:(\d+)/);
const size = sizeMatch ? Number(sizeMatch[1]) : 128;
return sampleGuild.iconURL({ size });
}
return undefined;
}

function parseExpressionValue(value: string): string {
const trimmed = value.trim();
if (!trimmed) return "";

const known = resolveKnownExpression(trimmed);
if (known !== undefined) return String(known);

if (trimmed[0] === '"' && trimmed[trimmed.length - 1] === '"') {
try {
return JSON.parse(trimmed);
} catch {
return trimmed.slice(1, -1);
}
}

if (trimmed[0] === "'" && trimmed[trimmed.length - 1] === "'") {
return trimmed.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\");
}

if (trimmed[0] === "`" && trimmed[trimmed.length - 1] === "`") {
const body = trimmed.slice(1, -1);
return body.replace(/\$\{([^}]+)\}/g, (_, expression: string) => {
const knownValue = resolveKnownExpression(expression.trim());
return knownValue === undefined ? "" : String(knownValue);
});
}

if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase();
if (!Number.isNaN(Number(trimmed))) return String(Number(trimmed));

return trimmed;
}

function parseObjectModeEmbed(code: string): Embed | undefined {
const embedsIndex = code.indexOf("embeds");
if (embedsIndex === -1) return undefined;
const bracketIndex = code.indexOf("[", embedsIndex);
if (bracketIndex === -1) return undefined;
const objectStart = code.indexOf("{", bracketIndex);
if (objectStart === -1) return undefined;
const objectEnd = findMatchingDelimiter(code, objectStart, "{", "}");
if (objectEnd === -1) return undefined;

const objectCode = code.slice(objectStart, objectEnd + 1);
// This is intentionally scoped to this app's generated object output format.
const normalizedJson = objectCode
.replace(/([{\[,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":')
.replace(/,(\s*[}\]])/g, "$1");

try {
return normalizeEmbed(JSON.parse(normalizedJson));
} catch {
return undefined;
}
}

function parseDiscordJs(code: string): Embed {
const parsedObjectMode = parseObjectModeEmbed(code);
if (parsedObjectMode) return parsedObjectMode;

const partial: Record<string, unknown> = { fields: [] };

const authorCalls = findMethodCalls(code, "setAuthor");
if (authorCalls.length) {
const call = authorCalls[authorCalls.length - 1];
if (call.trim().startsWith("{")) {
const name = extractPropertyValue(call, "name");
const url = extractPropertyValue(call, "url");
const iconURL = extractPropertyValue(call, "iconURL");
partial.author = {
name: name ? parseExpressionValue(name) : "",
url: url ? parseExpressionValue(url) : "",
iconURL: iconURL ? parseExpressionValue(iconURL) : ""
};
} else {
const args = splitTopLevelArgs(call);
partial.author = {
name: parseExpressionValue(args[0] ?? ""),
iconURL: parseExpressionValue(args[1] ?? ""),
url: parseExpressionValue(args[2] ?? "")
};
}
}

const titleCalls = findMethodCalls(code, "setTitle");
if (titleCalls.length) partial.title = parseExpressionValue(titleCalls[titleCalls.length - 1]);

const urlCalls = findMethodCalls(code, "setURL");
if (urlCalls.length) partial.url = parseExpressionValue(urlCalls[urlCalls.length - 1]);

const descriptionCalls = findMethodCalls(code, "setDescription");
if (descriptionCalls.length) {
partial.description = parseExpressionValue(
descriptionCalls[descriptionCalls.length - 1]
);
}

const imageCalls = findMethodCalls(code, "setImage");
if (imageCalls.length) partial.image = parseExpressionValue(imageCalls[imageCalls.length - 1]);

const thumbnailCalls = findMethodCalls(code, "setThumbnail");
if (thumbnailCalls.length) {
partial.thumbnail = parseExpressionValue(thumbnailCalls[thumbnailCalls.length - 1]);
}

const colorCalls = findMethodCalls(code, "setColor");
if (colorCalls.length) partial.color = parseExpressionValue(colorCalls[colorCalls.length - 1]);

const footerCalls = findMethodCalls(code, "setFooter");
if (footerCalls.length) {
const call = footerCalls[footerCalls.length - 1];
if (call.trim().startsWith("{")) {
const text = extractPropertyValue(call, "text");
const iconURL = extractPropertyValue(call, "iconURL");
partial.footer = {
text: text ? parseExpressionValue(text) : "",
iconURL: iconURL ? parseExpressionValue(iconURL) : ""
};
} else {
const args = splitTopLevelArgs(call);
partial.footer = {
text: parseExpressionValue(args[0] ?? ""),
iconURL: parseExpressionValue(args[1] ?? "")
};
}
}

const addFieldsCalls = findMethodCalls(code, "addFields");
for (const call of addFieldsCalls) {
const objects = extractObjectLiterals(call);
const fields = (partial.fields as unknown[]) || [];
for (const objectCode of objects) {
const name = extractPropertyValue(objectCode, "name");
const value = extractPropertyValue(objectCode, "value");
const inline = extractPropertyValue(objectCode, "inline");
fields.push({
name: parseExpressionValue(name ?? ""),
value: parseExpressionValue(value ?? ""),
inline: (inline ?? "").trim() === "true"
});
}
partial.fields = fields;
}

const addFieldCalls = findMethodCalls(code, "addField");
for (const call of addFieldCalls) {
const args = splitTopLevelArgs(call);
const fields = (partial.fields as unknown[]) || [];
fields.push({
name: parseExpressionValue(args[0] ?? ""),
value: parseExpressionValue(args[1] ?? ""),
inline: (args[2] ?? "").trim() === "true"
});
partial.fields = fields;
}

if (findMethodCalls(code, "setTimestamp").length) {
partial.timestamp = Date.now();
}

const hasEmbedData =
Object.keys(partial).length > 1 ||
findMethodCalls(code, "setTimestamp").length > 0;

if (!hasEmbedData) {
throw new Error(
"Expected embed builder methods like setTitle/setDescription/addFields, or an embeds object."
);
}

return normalizeEmbed(partial);
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
} catch (error) {
setEditorError(
`Invalid JSON: ${
error instanceof Error ? error.message : "fix syntax to update preview."
}`
);
}
}

function updateFromJs(value: string) {
try {
onEmbedChange(parseDiscordJs(value));
setEditorError("");
} catch (error) {
setEditorError(
`Invalid discord.js snippet: ${
error instanceof Error ? error.message : "keep editing to update preview."
}`
);
}
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
