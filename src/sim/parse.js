export function parse(source) {
  const text = [],
    code = [];
  source.split("\n").forEach((line) => {
    if (line.trimStart().startsWith("//")) {
      text.push(line.trimStart().slice(2).trim());
      code.push("");
    } else code.push(line);
  });
  const raw = code.join("\n");
  const body = raw.trim();
  const leading = raw.length - raw.trimStart().length;
  let jsonOffset = 0;
  if (!body) return { text: text.join("\n"), calls: [] };
  let data;
  try {
    if (/^[\[{]/.test(body)) data = JSON.parse(body);
    else {
      const short = body.match(/^(\w+)\s+(\{[\s\S]*\})$/);
      const func = body.match(/^(\w+)\(([\s\S]*)\)$/);
      if (short) {
        jsonOffset = body.indexOf(short[2]);
        data = { name: short[1], input: JSON.parse(short[2]) };
      } else if (func) {
        // Only JSON values are accepted; never eval player input.
        // Convert only top-level argument keys, leaving commas/equals in strings intact.
        let args = "",
          quoted = false,
          escaped = false,
          depth = 0,
          expectKey = true;
        for (let i = 0; i < func[2].length; i++) {
          const c = func[2][i];
          if (quoted) {
            args += c;
            if (escaped) escaped = false;
            else if (c === "\\") escaped = true;
            else if (c === '"') quoted = false;
            continue;
          }
          if (c === '"') {
            quoted = true;
            args += c;
            continue;
          }
          if (expectKey && depth === 0) {
            const m = func[2].slice(i).match(/^\s*([a-zA-Z_]\w*)\s*=/);
            if (m) {
              args += JSON.stringify(m[1]) + ":";
              i += m[0].length - 1;
              expectKey = false;
              continue;
            }
          }
          if (c === "{" || c === "[") depth++;
          if (c === "}" || c === "]") depth--;
          if (c === "," && depth === 0) expectKey = true;
          args += c;
        }
        data = { name: func[1], input: JSON.parse(`{${args}}`) };
      } else if (/^[\w-]+\s*[({]/.test(body) || body.includes("\n"))
        throw new Error("期望单个工具调用，多个调用请使用 JSON 数组");
      else return { text: [...text, body].join("\n"), calls: [] };
    }
    const calls = Array.isArray(data) ? data : [data];
    for (const call of calls)
      if (
        !call ||
        typeof call.name !== "string" ||
        !call.input ||
        Array.isArray(call.input) ||
        typeof call.input !== "object" ||
        Object.keys(call).some((k) => !["name", "input"].includes(k))
      )
        throw new Error("期望 {name: string, input: object}");
    return { text: text.join("\n"), calls };
  } catch (error) {
    const pos = Number(error.message.match(/position (\d+)/)?.[1] || 0);
    const prefix = raw.slice(0, leading + jsonOffset + pos).split("\n");
    throw new Error(
      `第 ${prefix.length} 行第 ${prefix.at(-1).length + 1} 列：${error.message}`,
    );
  }
}
