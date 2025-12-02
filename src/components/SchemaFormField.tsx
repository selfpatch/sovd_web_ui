import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { SchemaFieldType, TopicSchema } from '@/lib/types';

interface SchemaFormFieldProps {
    /** Field name to display */
    name: string;
    /** Schema definition for this field */
    schema: SchemaFieldType;
    /** Current value */
    value: unknown;
    /** Callback when value changes */
    onChange: (value: unknown) => void;
    /** Nesting depth for indentation */
    depth?: number;
}

/**
 * Check if a type is a primitive ROS 2 type
 */
function isPrimitiveType(type: string): boolean {
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
function isNumericType(type: string): boolean {
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
function isBooleanType(type: string): boolean {
    return type.toLowerCase() === 'bool' || type.toLowerCase() === 'boolean';
}

/**
 * Get default value for a schema type
 */
function getDefaultValue(schema: SchemaFieldType): unknown {
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
 * Render a form field based on its schema type
 */
export function SchemaFormField({ name, schema, value, onChange, depth = 0 }: SchemaFormFieldProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const indent = depth * 16;

    // Handle array types
    if (schema.type === 'array' && schema.items) {
        const arrayValue = Array.isArray(value) ? value : [];

        const addItem = () => {
            const newItem = getDefaultValue(schema.items!);
            onChange([...arrayValue, newItem]);
        };

        const removeItem = (index: number) => {
            onChange(arrayValue.filter((_, i) => i !== index));
        };

        const updateItem = (index: number, newValue: unknown) => {
            const newArray = [...arrayValue];
            newArray[index] = newValue;
            onChange(newArray);
        };

        return (
            <div style={{ marginLeft: indent }} className="space-y-2">
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </Button>
                    <span className="text-sm font-medium">{name}</span>
                    <span className="text-xs text-muted-foreground">array[{arrayValue.length}]</span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2"
                        onClick={addItem}
                    >
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                    </Button>
                </div>
                {isExpanded && (
                    <div className="pl-4 border-l border-muted space-y-2">
                        {arrayValue.map((item, index) => (
                            <div key={index} className="flex items-start gap-2">
                                <SchemaFormField
                                    name={`[${index}]`}
                                    schema={schema.items!}
                                    value={item}
                                    onChange={(v) => updateItem(index, v)}
                                    depth={0}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                    onClick={() => removeItem(index)}
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // Handle nested object types (has fields property)
    if (schema.fields) {
        const objectValue = (typeof value === 'object' && value !== null) ? value as Record<string, unknown> : {};

        const updateField = (fieldName: string, fieldValue: unknown) => {
            onChange({ ...objectValue, [fieldName]: fieldValue });
        };

        return (
            <div style={{ marginLeft: indent }} className="space-y-2">
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </Button>
                    <span className="text-sm font-medium">{name}</span>
                    <span className="text-xs text-muted-foreground">{schema.type}</span>
                </div>
                {isExpanded && (
                    <div className="pl-4 border-l border-muted space-y-3">
                        {Object.entries(schema.fields).map(([fieldName, fieldSchema]) => (
                            <SchemaFormField
                                key={fieldName}
                                name={fieldName}
                                schema={fieldSchema}
                                value={objectValue[fieldName]}
                                onChange={(v) => updateField(fieldName, v)}
                                depth={0}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // Handle primitive types
    if (isPrimitiveType(schema.type)) {
        // Boolean field
        if (isBooleanType(schema.type)) {
            return (
                <div style={{ marginLeft: indent }} className="flex items-center gap-3">
                    <label className="text-sm font-medium min-w-[120px]">{name}</label>
                    <input
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(e) => onChange(e.target.checked)}
                        className="h-4 w-4 rounded border-input"
                    />
                    <span className="text-xs text-muted-foreground">{schema.type}</span>
                </div>
            );
        }

        // Numeric field
        if (isNumericType(schema.type)) {
            const isInteger = !schema.type.includes('float') && schema.type !== 'double';
            const isUnsigned = schema.type.startsWith('uint') || schema.type === 'byte';

            return (
                <div style={{ marginLeft: indent }} className="flex items-center gap-3">
                    <label className="text-sm font-medium min-w-[120px]">{name}</label>
                    <Input
                        type="number"
                        step={isInteger ? 1 : 'any'}
                        min={isUnsigned ? 0 : undefined}
                        value={value as number ?? 0}
                        onChange={(e) => {
                            let val = isInteger ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
                            if (isNaN(val)) val = 0;
                            if (isUnsigned && val < 0) val = 0;
                            onChange(val);
                        }}
                        className="h-8 w-32 font-mono text-xs"
                    />
                    <span className="text-xs text-muted-foreground">{schema.type}</span>
                </div>
            );
        }

        // String field
        return (
            <div style={{ marginLeft: indent }} className="flex items-center gap-3">
                <label className="text-sm font-medium min-w-[120px]">{name}</label>
                <Input
                    type="text"
                    value={String(value ?? '')}
                    onChange={(e) => onChange(e.target.value)}
                    className="h-8 flex-1 font-mono text-xs"
                    maxLength={schema.max_length}
                />
                <span className="text-xs text-muted-foreground">{schema.type}</span>
            </div>
        );
    }

    // Fallback for unknown/complex types - show as JSON input
    return (
        <div style={{ marginLeft: indent }} className="flex items-center gap-3">
            <label className="text-sm font-medium min-w-[120px]">{name}</label>
            <Input
                type="text"
                value={JSON.stringify(value ?? null)}
                onChange={(e) => {
                    try {
                        onChange(JSON.parse(e.target.value));
                    } catch {
                        // Keep as string if not valid JSON
                        onChange(e.target.value);
                    }
                }}
                className="h-8 flex-1 font-mono text-xs"
                placeholder="JSON value"
            />
            <span className="text-xs text-muted-foreground">{schema.type}</span>
        </div>
    );
}

/**
 * Render a complete form based on a topic schema
 */
interface SchemaFormProps {
    schema: TopicSchema;
    value: Record<string, unknown>;
    onChange: (value: Record<string, unknown>) => void;
}

export function SchemaForm({ schema, value, onChange }: SchemaFormProps) {
    const updateField = (fieldName: string, fieldValue: unknown) => {
        onChange({ ...value, [fieldName]: fieldValue });
    };

    return (
        <div className="space-y-3">
            {Object.entries(schema).map(([fieldName, fieldSchema]) => (
                <SchemaFormField
                    key={fieldName}
                    name={fieldName}
                    schema={fieldSchema}
                    value={value[fieldName]}
                    onChange={(v) => updateField(fieldName, v)}
                />
            ))}
        </div>
    );
}
