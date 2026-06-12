import JSZip from "jszip";
import type { RichTextColorToken, RichTextSpan, ScriptBlock } from "@/types/teleprompter";

type InlineStyle = Omit<RichTextSpan, "id" | "text">;

const wordNamespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const blockMarkerPattern = /^\s*(?:\[BLOCK:\s*(.+?)\s*\]|#{3,}\s+(.+?))\s*$/i;

export async function importScriptFile(file: File): Promise<ScriptBlock[]> {
    const extension = getFileExtension(file.name);

    if (extension === "docx") {
        return createBlocksFromImportedDocx(await file.arrayBuffer());
    }

    const text = await file.text();

    if (extension === "html" || extension === "htm") {
        return createBlocksFromImportedHtml(text);
    }

    return createBlocksFromImportedText(text);
}

export function createBlocksFromImportedText(text: string): ScriptBlock[] {
    const blocks: ScriptBlock[] = [];
    let currentTitle = "Script";
    let currentLines: string[] = [];
    let foundExplicitBlock = false;

    const flush = (): void => {
        const content = currentLines.join("\n").trim();

        if (!content && blocks.length > 0) {
            return;
        }

        blocks.push({
            id: createId(),
            title: currentTitle.trim() || `Block ${blocks.length + 1}`,
            content: createRichTextContent(content)
        });
        currentTitle = `Block ${blocks.length + 1}`;
        currentLines = [];
    };

    text.replace(/\r\n?/g, "\n").split("\n").forEach((line) => {
        const marker = parseBlockMarker(line);

        if (marker) {
            if (foundExplicitBlock || currentLines.some((item) => item.trim().length > 0)) {
                flush();
            }

            foundExplicitBlock = true;
            currentTitle = marker;
            currentLines = [];
            return;
        }

        if (line.trim() === "---") {
            flush();
            return;
        }

        currentLines.push(line);
    });

    if (currentLines.some((line) => line.trim().length > 0) || blocks.length === 0) {
        flush();
    }

    return blocks.filter((block) => block.title.trim().length > 0 || block.content.spans.some((span) => span.text.trim().length > 0));
}

export function createBlocksFromImportedHtml(html: string): ScriptBlock[] {
    const document = new DOMParser().parseFromString(html, "text/html");
    const blocks: ScriptBlock[] = [];
    let currentTitle = "Script";
    let currentSpans: RichTextSpan[] = [];
    let foundExplicitBlock = false;

    const flush = (): void => {
        const spans = trimBoundaryWhitespace(mergeAdjacentSpans(currentSpans));

        if (spans.length === 0 && blocks.length > 0) {
            return;
        }

        blocks.push({
            id: createId(),
            title: currentTitle.trim() || `Block ${blocks.length + 1}`,
            content: {
                spans: spans.length > 0 ? spans : [{ id: createId(), text: "" }]
            }
        });
        currentTitle = `Block ${blocks.length + 1}`;
        currentSpans = [];
    };

    Array.from(document.body.childNodes).forEach((node) => {
        const plainText = getNodeText(node).trim();
        const marker = parseBlockMarker(plainText);

        if (marker) {
            if (foundExplicitBlock || currentSpans.some((span) => span.text.trim().length > 0)) {
                flush();
            }

            foundExplicitBlock = true;
            currentTitle = marker;
            currentSpans = [];
            return;
        }

        if (plainText === "---") {
            flush();
            return;
        }

        const nodeSpans = extractSpans(node, {});

        if (nodeSpans.length === 0) {
            return;
        }

        currentSpans.push(...nodeSpans, { id: createId(), text: "\n" });
    });

    if (currentSpans.some((span) => span.text.trim().length > 0) || blocks.length === 0) {
        flush();
    }

    return blocks;
}

export async function createBlocksFromImportedDocx(buffer: ArrayBuffer): Promise<ScriptBlock[]> {
    const zip = await JSZip.loadAsync(buffer);
    const documentFile = zip.file("word/document.xml");

    if (!documentFile) {
        throw new Error("DOCX file is missing word/document.xml.");
    }

    const xml = await documentFile.async("text");
    const document = new DOMParser().parseFromString(xml, "application/xml");
    const paragraphs = Array.from(document.getElementsByTagNameNS(wordNamespace, "p"));
    const blocks: ScriptBlock[] = [];
    let currentTitle = "Script";
    let currentSpans: RichTextSpan[] = [];
    let foundExplicitBlock = false;

    const flush = (): void => {
        const spans = trimBoundaryWhitespace(mergeAdjacentSpans(currentSpans));

        if (spans.length === 0 && blocks.length > 0) {
            return;
        }

        blocks.push({
            id: createId(),
            title: currentTitle.trim() || `Block ${blocks.length + 1}`,
            content: {
                spans: spans.length > 0 ? spans : [{ id: createId(), text: "" }]
            }
        });
        currentTitle = `Block ${blocks.length + 1}`;
        currentSpans = [];
    };

    paragraphs.forEach((paragraph) => {
        const paragraphSpans = extractDocxParagraphSpans(paragraph);
        const plainText = paragraphSpans.map((span) => span.text).join("").trim();
        const marker = parseBlockMarker(plainText);

        if (marker) {
            if (foundExplicitBlock || currentSpans.some((span) => span.text.trim().length > 0)) {
                flush();
            }

            foundExplicitBlock = true;
            currentTitle = marker;
            currentSpans = [];
            return;
        }

        if (plainText === "---") {
            flush();
            return;
        }

        if (paragraphSpans.length > 0) {
            currentSpans.push(...paragraphSpans, { id: createId(), text: "\n" });
        }
    });

    if (currentSpans.some((span) => span.text.trim().length > 0) || blocks.length === 0) {
        flush();
    }

    return blocks;
}

export function createRichTextContent(text: string): ScriptBlock["content"] {
    return {
        spans: [
            {
                id: createId(),
                text
            }
        ]
    };
}

export function createId(): string {
    return crypto.randomUUID();
}

function getFileExtension(name: string): string {
    const parts = name.toLowerCase().split(".");

    return parts.length > 1 ? parts[parts.length - 1] : "";
}

function parseBlockMarker(text: string): string | null {
    const match = blockMarkerPattern.exec(text);

    return match?.[1]?.trim() || match?.[2]?.trim() || null;
}

function extractSpans(node: Node, inheritedStyle: InlineStyle): RichTextSpan[] {
    if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? "";

        return text ? [{ ...inheritedStyle, id: createId(), text }] : [];
    }

    if (node.nodeName === "BR") {
        return [{ id: createId(), text: "\n" }];
    }

    if (!(node instanceof HTMLElement)) {
        return Array.from(node.childNodes).flatMap((child) => extractSpans(child, inheritedStyle));
    }

    const nextStyle = readElementStyle(node, inheritedStyle);
    const spans = Array.from(node.childNodes).flatMap((child) => extractSpans(child, nextStyle));

    if (isBlockElement(node) && spans.length > 0 && !spans[spans.length - 1].text.endsWith("\n")) {
        spans.push({ id: createId(), text: "\n" });
    }

    return spans;
}

function readElementStyle(element: HTMLElement, inheritedStyle: InlineStyle): InlineStyle {
    const tag = element.tagName.toLowerCase();
    const style = { ...inheritedStyle };
    const fontWeight = element.style.fontWeight;
    const textDecoration = element.style.textDecorationLine || element.style.textDecoration;
    const foreground = mapColorToToken(element.style.color);
    const background = mapColorToToken(element.style.backgroundColor);

    if (tag === "strong" || tag === "b" || fontWeight === "bold" || Number(fontWeight) >= 600) {
        style.bold = true;
    }

    if (tag === "em" || tag === "i" || element.style.fontStyle === "italic") {
        style.italic = true;
    }

    if (tag === "u" || textDecoration.includes("underline")) {
        style.underline = true;
    }

    if (tag === "mark") {
        style.backgroundColor = "warning";
    }

    if (foreground !== "default") {
        style.textColor = foreground;
    }

    if (background !== "default") {
        style.backgroundColor = background;
    }

    return style;
}

function extractDocxParagraphSpans(paragraph: Element): RichTextSpan[] {
    return Array.from(paragraph.getElementsByTagNameNS(wordNamespace, "r")).flatMap((run) => extractDocxRunSpans(run));
}

function extractDocxRunSpans(run: Element): RichTextSpan[] {
    const style = readDocxRunStyle(run);
    const spans: RichTextSpan[] = [];

    Array.from(run.childNodes).forEach((child) => {
        if (!(child instanceof Element)) {
            return;
        }

        if (child.namespaceURI !== wordNamespace) {
            return;
        }

        if (child.localName === "t") {
            const text = child.textContent ?? "";

            if (text) {
                spans.push({ ...style, id: createId(), text });
            }
        } else if (child.localName === "tab") {
            spans.push({ ...style, id: createId(), text: "\t" });
        } else if (child.localName === "br" || child.localName === "cr") {
            spans.push({ ...style, id: createId(), text: "\n" });
        }
    });

    return spans;
}

function readDocxRunStyle(run: Element): InlineStyle {
    const properties = firstChildByLocalName(run, "rPr");
    const style: InlineStyle = {};

    if (!properties) {
        return style;
    }

    if (hasEnabledDocxProperty(properties, "b")) {
        style.bold = true;
    }

    if (hasEnabledDocxProperty(properties, "i")) {
        style.italic = true;
    }

    const underline = firstChildByLocalName(properties, "u");

    if (underline && getWordAttribute(underline, "val") !== "none") {
        style.underline = true;
    }

    const colorElement = firstChildByLocalName(properties, "color");
    const colorValue = colorElement ? getWordAttribute(colorElement, "val") : null;

    if (colorValue && colorValue !== "auto") {
        const token = mapColorToToken(`#${colorValue}`);

        if (token !== "default") {
            style.textColor = token;
        }
    }

    const highlightElement = firstChildByLocalName(properties, "highlight");
    const highlightValue = highlightElement ? getWordAttribute(highlightElement, "val") : null;
    const highlightToken = mapDocxHighlightToToken(highlightValue);

    if (highlightToken !== "default") {
        style.backgroundColor = highlightToken;
    }

    const shadingElement = firstChildByLocalName(properties, "shd");
    const shadingFill = shadingElement ? getWordAttribute(shadingElement, "fill") : null;

    if (!style.backgroundColor && shadingFill && shadingFill !== "auto") {
        const token = mapColorToToken(`#${shadingFill}`);

        if (token !== "default") {
            style.backgroundColor = token;
        }
    }

    return style;
}

function firstChildByLocalName(element: Element, localName: string): Element | null {
    return Array.from(element.childNodes).find((child): child is Element => child instanceof Element && child.localName === localName && child.namespaceURI === wordNamespace) ?? null;
}

function hasEnabledDocxProperty(properties: Element, localName: string): boolean {
    const element = firstChildByLocalName(properties, localName);
    const value = element ? getWordAttribute(element, "val") : null;

    return Boolean(element && value !== "false" && value !== "0" && value !== "off");
}

function getWordAttribute(element: Element, name: string): string | null {
    return element.getAttributeNS(wordNamespace, name) ?? element.getAttribute(`w:${name}`) ?? element.getAttribute(name);
}

function mapDocxHighlightToToken(value: string | null): RichTextColorToken {
    if (!value) {
        return "default";
    }

    if (value === "yellow" || value === "darkYellow") {
        return "warning";
    }

    if (value === "green" || value === "darkGreen") {
        return "accent";
    }

    if (value === "red" || value === "darkRed") {
        return "live";
    }

    if (value === "blue" || value === "cyan" || value === "darkBlue" || value === "darkCyan") {
        return "blue";
    }

    if (value === "magenta" || value === "darkMagenta") {
        return "violet";
    }

    return "default";
}

function mapColorToToken(value: string): RichTextColorToken {
    if (!value || value === "transparent") {
        return "default";
    }

    const color = parseCssColor(value);

    if (!color) {
        return "default";
    }

    const { r, g, b } = color;

    if (r > 190 && g > 150 && b < 120) {
        return "warning";
    }

    if (g > r + 35 && g > b + 20) {
        return "accent";
    }

    if (r > 160 && g < 120 && b < 130) {
        return "live";
    }

    if (b > r + 25 && b > g - 10) {
        return "blue";
    }

    if (r > 130 && b > 130 && g < 130) {
        return "violet";
    }

    return "default";
}

function parseCssColor(value: string): { r: number; g: number; b: number } | null {
    const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(value);

    if (rgb) {
        return {
            r: Number(rgb[1]),
            g: Number(rgb[2]),
            b: Number(rgb[3])
        };
    }

    if (/^#[0-9a-f]{6}$/i.test(value)) {
        return {
            r: Number.parseInt(value.slice(1, 3), 16),
            g: Number.parseInt(value.slice(3, 5), 16),
            b: Number.parseInt(value.slice(5, 7), 16)
        };
    }

    if (/^#[0-9a-f]{3}$/i.test(value)) {
        return {
            r: Number.parseInt(value[1] + value[1], 16),
            g: Number.parseInt(value[2] + value[2], 16),
            b: Number.parseInt(value[3] + value[3], 16)
        };
    }

    return null;
}

function isBlockElement(element: HTMLElement): boolean {
    return ["address", "article", "aside", "blockquote", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "p", "section"].includes(element.tagName.toLowerCase());
}

function getNodeText(node: Node): string {
    if (node.nodeName === "BR") {
        return "\n";
    }

    return node.textContent ?? "";
}

function trimBoundaryWhitespace(spans: RichTextSpan[]): RichTextSpan[] {
    const next = spans.map((span) => ({ ...span }));

    while (next.length > 0 && next[0].text.trim().length === 0) {
        next.shift();
    }

    while (next.length > 0 && next[next.length - 1].text.trim().length === 0) {
        next.pop();
    }

    if (next.length > 0) {
        next[0].text = next[0].text.replace(/^\s+/, "");
        next[next.length - 1].text = next[next.length - 1].text.replace(/\s+$/, "");
    }

    return next.filter((span) => span.text.length > 0);
}

function mergeAdjacentSpans(spans: RichTextSpan[]): RichTextSpan[] {
    const merged: RichTextSpan[] = [];

    spans.forEach((span) => {
        const previous = merged[merged.length - 1];

        if (previous && haveSameStyle(previous, span)) {
            previous.text += span.text;
            return;
        }

        merged.push({ ...span });
    });

    return merged;
}

function haveSameStyle(left: RichTextSpan, right: RichTextSpan): boolean {
    return left.bold === right.bold && left.italic === right.italic && left.underline === right.underline && left.textColor === right.textColor && left.backgroundColor === right.backgroundColor;
}
