import Link from "next/link";
import { TeleprompterApp } from "@/components/TeleprompterApp";
import type { Role } from "@/types/teleprompter";

type RoleJoinPageProps = {
    params: Promise<{
        role: string;
    }>;
    searchParams: Promise<{
        room?: string;
        invite?: string;
    }>;
};

export default async function RoleJoinPage({ params, searchParams }: RoleJoinPageProps) {
    const [{ role }, query] = await Promise.all([params, searchParams]);
    const parsedRole = parseRole(role);

    if (!parsedRole) {
        return (
            <main className="shell">
                <section className="entry ready">
                    <div className="brand compact">
                        <span>TELEPRO</span>
                        <h1>Invalid invite</h1>
                        <p>This invite role is not supported. Ask the Producer for a new link.</p>
                    </div>
                    <Link className="manual-link" href="/">
                        Back to TelePRO
                    </Link>
                </section>
            </main>
        );
    }

    return <TeleprompterApp fixedRole={parsedRole} initialRoomCode={query.room ?? ""} inviteToken={query.invite} />;
}

function parseRole(value: string): Role | null {
    if (value === "producer" || value === "host" || value === "viewer") {
        return value;
    }

    return null;
}
