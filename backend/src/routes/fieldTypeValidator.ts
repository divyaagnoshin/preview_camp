export type FieldDataType =
  | 'STRING' | 'PHONE' | 'EMAIL'
  | 'INTEGER' | 'LONG' | 'FLOAT'
  | 'TIMESTAMP' | 'BOOLEAN';

export type SchemaMap = Map<string, FieldDataType>;

export function buildSchemaMap(rows: { field_key: string; data_type: string }[]): SchemaMap {
  const map = new Map<string, FieldDataType>();
  for (const row of rows) {
    if (row.field_key && row.data_type) {
      map.set(row.field_key, row.data_type.toUpperCase() as FieldDataType);
    }
  }
  return map;
}

const VALIDATORS: Record<FieldDataType, (v: string) => boolean> = {
  STRING:    () => true,
  PHONE:     (v) => /^\+?[\d\s\-().]*\d[\d\s\-().]*$/.test(v.trim()),
  EMAIL:     (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
  INTEGER:   (v) => /^-?\d+$/.test(v.trim()),
  LONG:      (v) => /^-?\d+$/.test(v.trim()),
  FLOAT:     (v) => /^-?\d+(\.\d+)?$/.test(v.trim()),
  TIMESTAMP: (v) => !isNaN(Date.parse(v.trim())),
  BOOLEAN:   (v) => /^(true|false|1|0|yes|no)$/i.test(v.trim()),
};

export function validateCustomFields(
  rowIndex: number,
  customFields: Record<string, any>,
  schemaMap: SchemaMap,
): string | null {
  for (const [fieldKey, value] of Object.entries(customFields)) {
    const expectedType = schemaMap.get(fieldKey);
    if (!expectedType) continue;
    if (value === null || value === undefined || String(value).trim() === '') continue;
    const valid = VALIDATORS[expectedType]?.(String(value)) ?? true;
    if (!valid) {
      return `Field "${fieldKey}" expects ${expectedType} but got "${value}"`;
    }
  }
  return null;
}