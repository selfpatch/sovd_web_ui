import type { SchemaFieldType, TopicSchema } from '@/lib/types';

/**
 * Check if a type is a primitive ROS 2 type
 */
export function isPrimitiveType(type: string): boolean {
    const primitives = [
        'bool', 'boolean',
        'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64',
        'float', 'float32', 'float64', 'double',
        'string', 'wstring',
        'byte', 'char',
    ];
    return primitives.includes(type.toLowerCase());
}

/**
 * Check if a type is numeric
 */
export function isNumericType(type: string): boolean {
    const numerics = [
        'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64',
        'float', 'float32', 'float64', 'double',
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
