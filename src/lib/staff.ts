// Zawmo's own account (an admin) looks after what is public — what search engines index: it may
// rename, describe and delete a public moment, and delete its shots and comments, as its owner
// could. Never a friends-only or link-only moment: those are their people's alone.
export const staffOver = (user: { isAdmin: boolean } | null | undefined, moment: { visibility: string }) => !!user?.isAdmin && moment.visibility === "PUBLIC";
