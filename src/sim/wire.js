export const wire = (context) => ({
  system: context.system,
  tools: context.tools,
  messages: context.messages.map((message) => ({
    ...message,
    content: message.content.map((block) =>
      block.type !== "tool_result" || !Array.isArray(block.content)
        ? block
        : {
            ...block,
            content: block.content.map((part) => {
              if (part.type !== "image" || !part.ephemeral) return part;
              const { ephemeral, ...image } = part;
              return image;
            }),
          },
    ),
  })),
});
