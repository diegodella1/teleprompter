import type { Metadata } from "next";
import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, Gauge, Radio, ShieldCheck, Signal, Users } from "lucide-react";
import "./manual.css";

export const metadata: Metadata = {
    title: "Operation Manual | Roxom.TV Teleprompter",
    description: "Role-based operation manual for the Roxom.TV web teleprompter"
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
        subtitle: "Room owner, script manager, display configuration, and talent signals.",
        responsibility: "Use this role when you need to prepare the room, publish the script, invite participants, monitor connected clients, tune prompt settings, and send live production cues.",
        sections: [
            {
                title: "Before the show",
                items: [
                    "Create a room from the landing screen with a clear production name.",
                    "Set separate PINs for Producer, Host, and Viewer access.",
                    "Copy the room code or invite links for the Host and Viewer devices.",
                    "Join the Producer Console after the room is ready.",
                    "Confirm that the Host and Viewer counts update as remote devices connect."
                ]
            },
            {
                title: "Script operation",
                items: [
                    "Create, reorder, or delete script blocks as the rundown changes.",
                    "Paste text into blocks or import a .txt or .md file.",
                    "Select words or phrases to apply text color or background color.",
                    "Use [PAUSA] for pause markers, [VTR: text] for media cues, parentheses for notes, --- for dividers, and **text** for emphasized lines.",
                    "Changes autosave and update the Host and Viewer displays without a Publish step.",
                    "Avoid large last-second rewrites while the Host is actively scrolling unless production confirms the change."
                ]
            },
            {
                title: "Live operation",
                items: [
                    "Use the Host and Viewer counters to verify that expected devices are present.",
                    "The Host controls speed, font size, and guide position before air; changes are shared with connected clients.",
                    "Send 30s, 60s, WRAP, STANDBY, GO, or a custom signal when production needs a visible cue.",
                    "Clear active signals once they are no longer needed.",
                    "If the Host loses control, share the Host invite link again or have the Host rejoin with the correct PIN."
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
                    "Open the Host invite link or enter the room code manually.",
                    "Select Host, enter a recognizable display name, and submit the Host PIN.",
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
                    "Open the Viewer invite link or enter the room code manually.",
                    "Select Viewer, enter a display name, and submit the Viewer PIN.",
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
                    "Refreshing the page requires joining again with the room code and PIN."
                ]
            }
        ]
    }
] as const;

const operatingChecklist = [
    "Create the room before distributing links.",
    "Use different PINs for each role.",
    "Have the Host join before sending talent to fullscreen.",
    "Confirm the Producer autosave status is Saved before live scrolling starts.",
    "Confirm Viewer devices show Following Host.",
    "Keep a Producer tab open throughout the production."
] as const;

const failureChecklist = [
    "If a Viewer is out of sync, refresh and rejoin with the Viewer PIN.",
    "If the Host disconnects, pause production scroll decisions until the Host rejoins.",
    "If the wrong person joins as Host, leave the room and rejoin with the correct role.",
    "If signals remain visible too long, the Producer should press Clear.",
    "If a script update is missing, the Producer should confirm the autosave status and retry the edit."
] as const;

export default function ManualPage() {
    return (
        <main className="manual-shell">
            <header className="manual-hero">
                <Link className="back-link" href="/">
                    <ArrowLeft size={18} /> Back to teleprompter
                </Link>
                <div>
                    <span className="eyebrow">ROXOM.TV TELEPROMPTER</span>
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
                    <strong>PIN-based access</strong>
                    <span>Each role uses its own PIN. Share only the link and PIN required for that device.</span>
                </article>
                <article>
                    <Gauge size={22} />
                    <strong>One live scroll source</strong>
                    <span>The Host is the active scroll controller. Viewers follow the Host state.</span>
                </article>
            </section>

            <section className="checklist-grid" aria-label="Production checklist">
                <Checklist title="Pre-flight checklist" icon={<Radio size={20} />} items={operatingChecklist} />
                <Checklist title="Recovery checklist" icon={<Signal size={20} />} items={failureChecklist} />
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
                                <section key={section.title}>
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
