type ActivityItem = {
  id: string;
  type: string;
  summary: string;
  createdAt: string;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ActivityFeed({ activities }: { activities: ActivityItem[] }) {
  if (activities.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No activity yet. Actions you take here will appear in real time, fed by the event-driven
        backbone.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {activities.map((a) => (
        <li key={a.id} className="flex gap-3 text-sm">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
          <div>
            <p>{a.summary}</p>
            <p className="text-xs text-muted-foreground">{timeAgo(a.createdAt)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
