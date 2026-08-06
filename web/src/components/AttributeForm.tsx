// Renders form fields from an asset_types.attribute_schema (JSON Schema) +
// optional ui_schema, per spec 6.4: "generates the type-specific fields
// dynamically... Use a JSON-Schema form library if one is already in the
// repo; otherwise write a small renderer supporting string, number,
// integer, boolean, enum, and date." No such library exists in this repo
// (web/package.json has none), so this is that small renderer - not a
// general JSON Schema implementation, just these six shapes.
interface JsonSchemaProperty {
  type?: string;
  enum?: (string | number)[];
  format?: string;
  minimum?: number;
  maximum?: number;
  unit?: string;
  title?: string;
}

interface JsonSchemaObject {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

interface UiSchema {
  order?: string[];
  labels?: Record<string, string>;
}

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AttributeForm({
  schema,
  uiSchema,
  values,
  onChange,
  disabled,
}: {
  schema: Record<string, unknown>;
  uiSchema?: Record<string, unknown> | null;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  const schemaObj = schema as JsonSchemaObject;
  const properties = schemaObj.properties ?? {};
  const required = new Set(schemaObj.required ?? []);
  const ui = (uiSchema ?? {}) as UiSchema;

  const orderedKeys =
    ui.order && ui.order.length > 0 ? ui.order.filter((k) => k in properties) : Object.keys(properties);

  if (orderedKeys.length === 0) {
    return <p className="muted">This asset type has no type-specific fields.</p>;
  }

  function setField(key: string, value: unknown) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="property-rows">
      {orderedKeys.map((key) => {
        const prop = properties[key];
        const label = ui.labels?.[key] ?? prop.title ?? humanizeKey(key);
        return (
          <div className="property-row" key={key}>
            <span className="property-row-label">
              {label}
              {prop.unit ? ` (${prop.unit})` : ""}
              {required.has(key) ? " *" : ""}
            </span>
            <AttributeField
              propKey={key}
              prop={prop}
              value={values[key]}
              onChange={(value) => setField(key, value)}
              disabled={disabled}
            />
          </div>
        );
      })}
    </div>
  );
}

function AttributeField({
  propKey,
  prop,
  value,
  onChange,
  disabled,
}: {
  propKey: string;
  prop: JsonSchemaProperty;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  if (prop.enum) {
    return (
      <select
        id={propKey}
        value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? undefined : (prop.enum!.find((opt) => String(opt) === raw) ?? raw));
        }}
        disabled={disabled}
      >
        <option value="">—</option>
        {prop.enum.map((opt) => (
          <option key={String(opt)} value={String(opt)}>
            {String(opt)}
          </option>
        ))}
      </select>
    );
  }

  if (prop.type === "boolean") {
    return (
      <input
        id={propKey}
        type="checkbox"
        checked={value === true}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
    );
  }

  if (prop.type === "number" || prop.type === "integer") {
    return (
      <input
        id={propKey}
        type="number"
        step={prop.type === "integer" ? 1 : "any"}
        min={prop.minimum}
        max={prop.maximum}
        value={typeof value === "number" ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        disabled={disabled}
      />
    );
  }

  if (prop.type === "string" && prop.format === "date") {
    return (
      <input
        id={propKey}
        type="date"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        disabled={disabled}
      />
    );
  }

  return (
    <input
      id={propKey}
      type="text"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      disabled={disabled}
    />
  );
}
