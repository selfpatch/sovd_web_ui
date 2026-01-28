import type { SchemaFieldType, TopicSchema } from '@/lib/types';

// =============================================================================
// JSON Schema to TopicSchema Conversion
// =============================================================================

/**
 * JSON Schema format returned by the API
 */
interface JsonSchemaField {
    type?: string;
    properties?: Record<string, JsonSchemaField>;
    items?: JsonSchemaField;
}

/**
 * Map JSON Schema types to ROS 2 primitive types
 */
function mapJsonSchemaType(type: string | undefined): string {
    if (!type) return 'object';
    switch (type) {
        case 'integer':
            return 'int32';
        case 'number':
            return 'float64';
        case 'boolean':
            return 'bool';
        case 'string':
            return 'string';
        case 'array':
            return 'array';
        case 'object':
            return 'object';
        default:
            return type;
    }
}

/**
 * Convert a single JSON Schema field to SchemaFieldType
 */
function convertJsonSchemaField(field: JsonSchemaField): SchemaFieldType {
    const result: SchemaFieldType = {
        type: mapJsonSchemaType(field.type),
    };

    // Handle nested objects (properties -> fields)
    if (field.properties) {
        result.fields = {};
        for (const [key, value] of Object.entries(field.properties)) {
            result.fields[key] = convertJsonSchemaField(value);
        }
    }

    // Handle arrays
    if (field.items) {
        result.items = convertJsonSchemaField(field.items);
    }

    return result;
}

/**
 * Convert JSON Schema format (from API) to TopicSchema format (for frontend)
 *
 * API returns:
 * ```json
 * { "type": "object", "properties": { "field": { "type": "integer" } } }
 * ```
 *
 * Frontend expects:
 * ```json
 * { "field": { "type": "int32" } }
 * ```
 */
export function convertJsonSchemaToTopicSchema(jsonSchema: unknown): TopicSchema | undefined {
    if (!jsonSchema || typeof jsonSchema !== 'object') {
        return undefined;
    }

    const schema = jsonSchema as JsonSchemaField;

    // If it has properties at root level, convert them
    if (schema.properties) {
        const result: TopicSchema = {};
        for (const [key, value] of Object.entries(schema.properties)) {
            result[key] = convertJsonSchemaField(value);
        }
        return result;
    }

    // Already in TopicSchema format or unknown format
    return jsonSchema as TopicSchema;
}

// =============================================================================
// Type Checking Utilities
// =============================================================================

/**
 * Check if a type is a primitive ROS 2 type
 */
export function isPrimitiveType(type: string): boolean {
    const primitives = [
        'bool',
        'boolean',
        'int8',
        'uint8',
        'int16',
        'uint16',
        'int32',
        'uint32',
        'int64',
        'uint64',
        'float',
        'float32',
        'float64',
        'double',
        'string',
        'wstring',
        'byte',
        'char',
    ];
    return primitives.includes(type.toLowerCase());
}

/**
 * Check if a type is numeric
 */
export function isNumericType(type: string): boolean {
    const numerics = [
        'int8',
        'uint8',
        'int16',
        'uint16',
        'int32',
        'uint32',
        'int64',
        'uint64',
        'float',
        'float32',
        'float64',
        'double',
        'byte',
    ];
    return numerics.includes(type.toLowerCase());
}

/**
 * Check if a type is boolean
 */
export function isBooleanType(type: string): boolean {
    return type.toLowerCase() === 'bool' || type.toLowerCase() === 'boolean';
}

/**
 * Get default value for a schema field
 */
export function getDefaultValue(schema: SchemaFieldType): unknown {
    if (schema.type === 'array') {
        return [];
    }
    if (schema.fields) {
        // Nested object - recursively create defaults
        const obj: Record<string, unknown> = {};
        for (const [key, fieldSchema] of Object.entries(schema.fields)) {
            obj[key] = getDefaultValue(fieldSchema);
        }
        return obj;
    }
    if (isNumericType(schema.type)) {
        return 0;
    }
    if (isBooleanType(schema.type)) {
        return false;
    }
    return '';
}

/**
 * Generate complete default values for a topic schema
 * This creates a full object with all fields from the schema populated with their default values
 */
export function getSchemaDefaults(schema: TopicSchema): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};
    for (const [fieldName, fieldSchema] of Object.entries(schema)) {
        defaults[fieldName] = getDefaultValue(fieldSchema);
    }
    return defaults;
}

/**
 * Deep merge two objects, giving precedence to values in 'source'
 * Used to overlay user-provided values onto schema defaults
 */
export function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...target };

    for (const key in source) {
        const sourceValue = source[key];
        const targetValue = result[key];

        if (sourceValue !== null && sourceValue !== undefined) {
            // If both are objects, merge recursively
            if (
                typeof sourceValue === 'object' &&
                !Array.isArray(sourceValue) &&
                typeof targetValue === 'object' &&
                !Array.isArray(targetValue) &&
                targetValue !== null
            ) {
                result[key] = deepMerge(targetValue as Record<string, unknown>, sourceValue as Record<string, unknown>);
            } else {
                // Otherwise, take the source value
                result[key] = sourceValue;
            }
        }
    }

    return result;
}
