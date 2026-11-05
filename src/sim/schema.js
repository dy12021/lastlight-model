export function validate(schema, value, path = "input") {
  if (value === undefined && "default" in schema)
    value = structuredClone(schema.default);
  const type = schema.type;
  const valid =
    type === "object"
      ? value !== null && typeof value === "object" && !Array.isArray(value)
      : type === "array"
        ? Array.isArray(value)
        : type === "integer"
          ? Number.isInteger(value)
          : typeof value === type;
  if (!valid)
    throw new Error(
      `${path}: expected ${type}, got ${value === null ? "null" : typeof value}`,
    );
  if (schema.enum && !schema.enum.includes(value))
    throw new Error(`${path}: expected one of ${schema.enum.join(" | ")}`);
  if (schema.minimum !== undefined && value < schema.minimum)
    throw new Error(`${path}: minimum ${schema.minimum}`);
  if (schema.maximum !== undefined && value > schema.maximum)
    throw new Error(`${path}: maximum ${schema.maximum}`);
  if (type === "object") {
    if (
      schema.minProperties !== undefined &&
      Object.keys(value).length < schema.minProperties
    )
      throw new Error(
        `${path}: at least ${schema.minProperties} property required`,
      );
    if (
      schema.maxProperties !== undefined &&
      Object.keys(value).length > schema.maxProperties
    )
      throw new Error(
        `${path}: at most ${schema.maxProperties} property allowed`,
      );
    const out = {};
    for (const name of schema.required || [])
      if (!(name in value)) throw new Error(`${path}.${name}: required`);
    for (const name of Object.keys(value))
      if (!(name in (schema.properties || {})))
        throw new Error(`${path}.${name}: unknown property`);
    for (const [name, child] of Object.entries(schema.properties || {}))
      if (name in value || "default" in child)
        out[name] = validate(child, value[name], `${path}.${name}`);
    return out;
  }
  if (type === "array")
    return value.map((item, i) =>
      validate(schema.items, item, `${path}[${i}]`),
    );
  return value;
}
