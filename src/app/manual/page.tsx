import type { Metadata } from "next";
import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, FileText, Gauge, Radio, ShieldCheck, Signal, Users } from "lucide-react";
import "./manual.css";

export const metadata: Metadata = {
    title: "Operation Manual | Teleprompter",
    description: "Role-based operation manual for the collaborative web teleprompter"
};

type ManualSection = {
    title: string;
    items: readonly string[];
    shortcuts?: readonly ShortcutReference[];
};

type ShortcutReference = {
    keys: string;
    action: string;
    useCase: string;
};

type RoleManual = {
    title: string;
    subtitle: string;
    responsibility: string;
    sections: readonly ManualSection[];
};

const roleManuals: readonly RoleManual[] = [
    {
        title: "Producer",
        subtitle: "Room owner, script manager, invite coordinator, and talent signals.",
        responsibility: "Use this role when you need to create the room, prepare the script, manage script blocks, invite participants, monitor connected clients, and send live production cues.",
        sections: [
            {
                title: "Before the show",
                items: [
                    "Create a room from the landing screen with a clear production name.",
                    "Set separate PINs for Producer, Host, and Viewer fallback access.",
                    "Copy the secure invite links for Producer, Host, and Viewer devices.",
                    "Open the Producer Console after the room is ready.",
                    "Confirm that the Host and Viewer counts update as remote devices connect."
                ]
            },
            {
                title: "Script operation",
                items: [
                    "Create, reorder, or delete script blocks as the rundown changes.",
                    "Paste formatted text into blocks or import a .txt, .md, .html, or .docx file.",
                    "Use [BLOCK: Title], ### Title, or a standalone --- line to split imported files into blocks automatically.",
                    "Use [PAUSE] for pause markers, [VTR: text] for media cues, parentheses for notes, and **text** for emphasized lines.",
                    "Select words or phrases to apply Signal-safe text color or background color.",
                    "Wait for the status to return to Saved after edits; the Host and Viewer displays update without a Publish step.",
                    "Avoid large last-second rewrites while the Host is actively scrolling unless production confirms the change."
                ]
            },
            {
                title: "DOCX preparation",
                items: [
                    "Write the document in English and use explicit block markers where each new teleprompter block should start.",
                    "Place [BLOCK: Segment Title] on its own line before each segment when you want the most predictable import.",
                    "Use ### Segment Title as a Markdown-style alternative when writing in a shared script document.",
                    "Use a standalone --- line only when you want to split the script without naming the next block.",
                    "Apply bold, italic, underline, text color, or highlight in Word only where it should appear on the teleprompter.",
                    "Avoid Word tables, images, comments, page headers, footers, columns, and layout-only formatting; the importer keeps teleprompter-safe text styling, not page layout."
                ]
            },
            {
                title: "Live operation",
                items: [
                    "Use the Host and Viewer counters to verify that expected devices are present.",
                    "Confirm the Host has set speed, font size, and guide position before air.",
                    "Send 30s, 60s, WRAP, STANDBY, GO, or a custom signal when production needs a visible cue.",
                    "Clear active signals once they are no longer needed.",
                    "If the Host loses control, share the Host invite link again or have the Host rejoin manually with the correct PIN."
                ]
            }
        ]
    },
    {
        title: "Host",
        subtitle: "Active scroll controller for the live read.",
        responsibility: "Use this role for the person or operator who drives the teleprompter playback. The Host controls play, pause, stop, top reset, manual nudges, and the scroll state followed by Viewer devices.",
        sections: [
            {
                title: "Joining",
                items: [
                    "Open the Host invite link.",
                    "Enter a recognizable display name; use the Host PIN only if the invite is missing or rejected.",
                    "Wait for the script to load and verify the room code in the top bar.",
                    "Confirm with the Producer that the Host status is visible before live operation."
                ]
            },
            {
                title: "Prompt controls",
                items: [
                    "Press Play to begin live scrolling at the selected speed.",
                    "Press Pause to hold the current position without resetting the script.",
                    "Use Top to return to the beginning of the script.",
                    "Use Up and Down for small manual corrections.",
                    "Use Previous Block and Next Block to move through the Producer's block order.",
                    "Adjust Speed, Font, and Guide from the Host controls; those settings are shared with connected displays.",
                    "Use Stop to halt playback and publish a stopped state to connected Viewers."
                ]
            },
            {
                title: "Shortcut reference",
                shortcuts: [
                    {
                        keys: "Space",
                        action: "Play / Pause",
                        useCase: "Start or hold the live scroll without moving away from the current read position."
                    },
                    {
                        keys: "Escape",
                        action: "Stop",
                        useCase: "Stop playback and publish a stopped state to connected Viewer devices."
                    },
                    {
                        keys: "Arrow Up",
                        action: "Nudge backward",
                        useCase: "Make a small correction when the text is slightly ahead of the reader."
                    },
                    {
                        keys: "Arrow Down",
                        action: "Nudge forward",
                        useCase: "Make a small correction when the text is slightly behind the reader."
                    },
                    {
                        keys: "Page Up",
                        action: "Previous block",
                        useCase: "Jump to the previous Producer block in the current rundown order."
                    },
                    {
                        keys: "Page Down",
                        action: "Next block",
                        useCase: "Jump to the next Producer block in the current rundown order."
                    },
                    {
                        keys: "Home",
                        action: "Top of script",
                        useCase: "Return to the beginning of the full teleprompter script."
                    },
                    {
                        keys: "End",
                        action: "End of script",
                        useCase: "Jump to the end of the full teleprompter script."
                    }
                ],
                items: [
                    "All Host shortcuts use single keys so they can be mapped to common Bluetooth presenters or pointer devices.",
                    "Keyboard shortcuts are ignored while the operator is focused inside an input, slider, text area, or editable field."
                ]
            }
        ]
    },
    {
        title: "Viewer",
        subtitle: "Read-only synchronized teleprompter display.",
        responsibility: "Use this role for talent, confidence monitors, secondary screens, and read-only production observers. Viewers follow the Host and cannot edit scripts, control playback, or send signals.",
        sections: [
            {
                title: "Joining",
                items: [
                    "Open the Viewer invite link.",
                    "Enter a display name; use the Viewer PIN only if the invite is missing or rejected.",
                    "Wait for the script, room configuration, and latest scroll state to load.",
                    "Check that the status reads Following Host when the Host is connected."
                ]
            },
            {
                title: "During the show",
                items: [
                    "Keep the tab active and avoid manual scrolling unless production asks for a local check.",
                    "Use Fullscreen on talent or monitor devices to reduce browser chrome.",
                    "Use Mirror only when the display hardware requires reversed text.",
                    "Watch for signal overlays such as 30s, 60s, WRAP, STANDBY, GO, or custom messages.",
                    "If the status changes to Waiting for Host, keep the screen open and wait for Host reconnection."
                ]
            },
            {
                title: "Limitations",
                items: [
                    "Viewers cannot publish scripts or change shared room settings.",
                    "Viewers cannot play, pause, stop, or reposition the room for others.",
                    "Local mirror and fullscreen do not affect other participants.",
                    "Refreshing the page requires opening the invite link again or joining manually with the room code and PIN."
                ]
            }
        ]
    }
] as const;

const operatingChecklist = [
    "Create the room before distributing links.",
    "Share secure invite links instead of asking operators to choose roles manually.",
    "Keep different PINs available as manual fallback access.",
    "Have the Host join before sending talent to fullscreen.",
    "Confirm the Producer autosave status is Saved before live scrolling starts.",
    "Confirm Viewer devices show Following Host.",
    "Keep a Producer tab open throughout the production."
] as const;

const failureChecklist = [
    "If a Viewer is out of sync, refresh the Viewer invite link or rejoin manually with the Viewer PIN.",
    "If the Host disconnects, pause production scroll decisions until the Host rejoins.",
    "If the wrong person joins as Host, leave the room and rejoin with the correct role.",
    "If signals remain visible too long, the Producer should press Clear.",
    "If a script update is missing, the Producer should confirm the autosave status and retry the edit."
] as const;

const liveFlow = [
    {
        step: "1",
        title: "Create",
        text: "Producer creates the room and gets secure role invite links."
    },
    {
        step: "2",
        title: "Prepare",
        text: "Producer edits blocks and waits for Saved before air."
    },
    {
        step: "3",
        title: "Drive",
        text: "Host controls playback, block jumps, speed, font, and guide."
    },
    {
        step: "4",
        title: "Read",
        text: "Viewers follow the Host and watch production signals."
    }
] as const;

const importFormatExample = `[BLOCK: Opening Market Read]
Good morning. Bitcoin is holding key levels into the US session.

[VTR: BTC daily chart]

[PAUSE]

[BLOCK: Guest Intro]
Joining us now is the desk for the market structure read.

### Wrap
That is the latest from the live desk.`;

export default function ManualPage() {
    return (
        <main className="manual-shell">
            <header className="manual-hero">
                <Link className="back-link" href="/">
                    <ArrowLeft size={18} /> Back to teleprompter
                </Link>
                <div>
                    <span className="eyebrow">TELEPROMPTER</span>
                    <h1>Operation Manual</h1>
                    <p>Role-based operating procedures for remote production over WAN. Use this page to brief Producers, Hosts, and Viewers before a live session.</p>
                </div>
            </header>

            <section className="manual-summary" aria-label="Operating summary">
                <article>
                    <Users size={22} />
                    <strong>Three operational roles</strong>
                    <span>Producer prepares and supervises, Host drives scroll, Viewer reads only.</span>
                </article>
                <article>
                    <ShieldCheck size={22} />
                    <strong>Role-based access</strong>
                    <span>Each role has a secure invite link, with PINs available for manual fallback.</span>
                </article>
                <article>
                    <Gauge size={22} />
                    <strong>One live scroll source</strong>
                    <span>The Host is the active scroll controller. Viewers follow the Host state.</span>
                </article>
            </section>

            <section className="flow-strip" aria-label="Live workflow">
                {liveFlow.map((item) => (
                    <article key={item.step}>
                        <span>{item.step}</span>
                        <strong>{item.title}</strong>
                        <p>{item.text}</p>
                    </article>
                ))}
            </section>

            <section className="checklist-grid" aria-label="Production checklist">
                <Checklist title="Pre-flight checklist" icon={<Radio size={20} />} items={operatingChecklist} />
                <Checklist title="Recovery checklist" icon={<Signal size={20} />} items={failureChecklist} />
            </section>

            <section className="format-guide" aria-label="Script import format">
                <div className="format-guide-heading">
                    <FileText size={24} />
                    <div>
                        <span className="eyebrow">SCRIPT IMPORT FORMAT</span>
                        <h2>Preparing DOCX and rich text for automatic blocks</h2>
                    </div>
                </div>
                <p>
                    The importer reads DOCX, HTML, Markdown, and plain text into teleprompter blocks. It preserves safe inline formatting such as bold, italic, underline, text color, and highlights, then maps colors to the Signal palette so every device renders consistently.
                </p>
                <div className="format-guide-grid">
                    <article>
                        <h3>Block markers</h3>
                        <ul>
                            <li>
                                <code>[BLOCK: Title]</code> starts a named block.
                            </li>
                            <li>
                                <code>### Title</code> also starts a named block.
                            </li>
                            <li>
                                <code>---</code> on its own line splits blocks without naming the next one.
                            </li>
                            <li>If no marker exists, the import creates one block named Script.</li>
                        </ul>
                    </article>
                    <article>
                        <h3>DOCX rules</h3>
                        <ul>
                            <li>Put block markers on their own paragraph lines in Word.</li>
                            <li>Use Word bold, italic, underline, font color, and highlight normally.</li>
                            <li>Keep rundown notes as normal text; parenthetical lines render as smaller notes.</li>
                            <li>Do not rely on page breaks, margins, columns, images, or tables for teleprompter behavior.</li>
                        </ul>
                    </article>
                </div>
                <pre aria-label="Script import example">{importFormatExample}</pre>
            </section>

            <section className="role-manuals" aria-label="Role manuals">
                {roleManuals.map((manual) => (
                    <article className="role-manual" key={manual.title}>
                        <div className="role-heading">
                            <Eye size={24} />
                            <div>
                                <span className="eyebrow">{manual.subtitle}</span>
                                <h2>{manual.title}</h2>
                            </div>
                        </div>
                        <p className="responsibility">{manual.responsibility}</p>
                        <div className="section-list">
                            {manual.sections.map((section) => (
                                <section className={section.shortcuts ? "wide-section" : undefined} key={section.title}>
                                    <h3>{section.title}</h3>
                                    {section.shortcuts ? <ShortcutGrid shortcuts={section.shortcuts} /> : null}
                                    <ol>
                                        {section.items.map((item) => (
                                            <li key={item}>{item}</li>
                                        ))}
                                    </ol>
                                </section>
                            ))}
                        </div>
                    </article>
                ))}
            </section>
        </main>
    );
}

function ShortcutGrid({ shortcuts }: { shortcuts: readonly ShortcutReference[] }) {
    return (
        <div className="shortcut-grid">
            <div className="shortcut-grid-header">Shortcut</div>
            <div className="shortcut-grid-header">Action</div>
            <div className="shortcut-grid-header">Use case</div>
            {shortcuts.map((shortcut) => (
                <Fragment key={shortcut.keys}>
                    <div>
                        <kbd>{shortcut.keys}</kbd>
                    </div>
                    <strong>{shortcut.action}</strong>
                    <span>{shortcut.useCase}</span>
                </Fragment>
            ))}
        </div>
    );
}

function Checklist({ title, icon, items }: { title: string; icon: ReactNode; items: readonly string[] }) {
    return (
        <article className="checklist">
            <div className="checklist-title">
                {icon}
                <h2>{title}</h2>
            </div>
            <ul>
                {items.map((item) => (
                    <li key={item}>{item}</li>
                ))}
            </ul>
        </article>
    );
}
