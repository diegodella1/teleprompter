const spans = [{ id: "base", text: "Line one\nLine two\nLine three" }];
const start = "Line one\n".length;
const end = start + "Line two".length;
const result = applyColorToSpans(spans, start, end, "backgroundColor", "warning");
const styled = result.find((span) => span.backgroundColor === "warning");

if (!styled || styled.text !== "Line two") {
    throw new Error(`Expected to style "Line two", got ${JSON.stringify(result)}`);
}

console.log("Rich selection check passed");

function applyColorToSpans(spans, start, end, kind, token) {
    let cursor = 0;
    const next = [];

    spans.forEach((span) => {
        const spanStart = cursor;
        const spanEnd = cursor + span.text.length;
        cursor = spanEnd;

        if (spanEnd <= start || spanStart >= end) {
            next.push(span);
            return;
        }

        const before = span.text.slice(0, Math.max(0, start - spanStart));
        const selected = span.text.slice(Math.max(0, start - spanStart), Math.min(span.text.length, end - spanStart));
        const after = span.text.slice(Math.min(span.text.length, end - spanStart));

        if (before) {
            next.push({ ...span, id: `${span.id}-before`, text: before });
        }

        if (selected) {
            const styled = { ...span, id: `${span.id}-selected`, text: selected };

            if (token === "default") {
                delete styled[kind];
            } else {
                styled[kind] = token;
            }

            next.push(styled);
        }

        if (after) {
            next.push({ ...span, id: `${span.id}-after`, text: after });
        }
    });

    return next;
}
