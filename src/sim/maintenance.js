// A local automation's request is user input, not a system instruction or a
// fabricated tool result. Metadata is kept outside the wire message.
export function addMaintenanceRequest(context, text) {
  if (!text || context.entries.some((entry) => entry.origin === "maintenance"))
    return false;
  context.append(
    { role: "user", content: [{ type: "text", text }] },
    "Home Asistent / 本地维护队列",
  );
  context.entries.at(-1).origin = "maintenance";
  context.fade();
  return true;
}
