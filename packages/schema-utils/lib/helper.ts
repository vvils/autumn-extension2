/**
 * Type definition for a JSON Schema object
 */
export interface JsonSchemaObject {
  $ref?: string;
  $defs?: Record<string, JsonSchemaObject>;
  type?: string;
  properties?: Record<string, JsonSchemaObject>;
  items?: JsonSchemaObject;
  anyOf?: JsonSchemaObject[];
  title?: string;
  description?: string;
  required?: string[];
  default?: unknown;
  additionalProperties?: boolean;
  [key: string]: unknown;
}

/**
 * Dereferences all $ref fields in a JSON schema by replacing them with the actual referenced schema
 *
 * @param schema The JSON schema to dereference
 * @returns A new JSON schema with all references resolved
 */
export function dereferenceJsonSchema(schema: JsonSchemaObject): JsonSchemaObject {
  // Create a deep copy of the schema to avoid modifying the original
  const clonedSchema = JSON.parse(JSON.stringify(schema));

  // Extract definitions to use for resolving references
  const definitions = clonedSchema.$defs || {};

  // Process the schema
  const result = processSchemaNode(clonedSchema, definitions);

  // Create a new object without $defs
  const resultWithoutDefs: JsonSchemaObject = {};

  // Copy all properties except $defs
  for (const [key, value] of Object.entries(result)) {
    if (key !== '$defs') {
      resultWithoutDefs[key] = value;
    }
  }

  return resultWithoutDefs;
}

/**
 * Process a schema node, resolving all references
 */
function processSchemaNode(node: JsonSchemaObject, definitions: Record<string, JsonSchemaObject>): JsonSchemaObject {
  // If it's not an object or is null, return as is
  if (typeof node !== 'object' || node === null) {
    return node;
  }

  // If it's a reference, resolve it
  if (node.$ref) {
    const refPath = node.$ref.replace('#/$defs/', '');
    const definition = definitions[refPath];
    if (definition) {
      // Process the definition to resolve any nested references
      const processedDefinition = processSchemaNode(definition, definitions);

      // Create a new object that preserves properties from the original node (except $ref)
      const result: JsonSchemaObject = {};

      // First copy properties from the original node except $ref
      for (const [key, value] of Object.entries(node)) {
        if (key !== '$ref') {
          result[key] = value;
        }
      }

      // Then copy properties from the processed definition
      // Don't override any existing properties in the original node
      for (const [key, value] of Object.entries(processedDefinition)) {
        if (result[key] === undefined) {
          result[key] = value;
        }
      }

      return result;
    }
  }

  // Handle anyOf for references
  if (node.anyOf) {
    // Process each item in anyOf
    const processedAnyOf = node.anyOf.map(item => processSchemaNode(item, definitions));

    // If anyOf contains a reference and a null type, merge them
    const nonNullTypes = processedAnyOf.filter(item => item.type !== 'null');
    const hasNullType = processedAnyOf.some(item => item.type === 'null');

    if (nonNullTypes.length === 1 && hasNullType) {
      // Create a result that preserves all properties from the original node
      const result: JsonSchemaObject = {};

      // Copy all properties from original node except anyOf
      for (const [key, value] of Object.entries(node)) {
        if (key !== 'anyOf') {
          result[key] = value;
        }
      }

      // Merge in properties from the non-null type
      for (const [key, value] of Object.entries(nonNullTypes[0])) {
        // Don't override properties that were in the original node
        if (result[key] === undefined) {
          result[key] = value;
        }
      }

      result.nullable = true;
      return result;
    }

    // Otherwise, keep the anyOf structure but with processed items
    return {
      ...node,
      anyOf: processedAnyOf,
    };
  }

  // Create a new node with processed properties
  const result: JsonSchemaObject = {};

  // Copy all properties except $ref
  for (const [key, value] of Object.entries(node)) {
    if (key !== '$ref') {
      if (key === 'properties' && typeof value === 'object' && value !== null) {
        // Process properties
        result.properties = {};
        for (const [propKey, propValue] of Object.entries(value)) {
          result.properties[propKey] = processSchemaNode(propValue as JsonSchemaObject, definitions);
        }
      } else if (key === 'items' && typeof value === 'object' && value !== null) {
        // Process items for arrays
        result.items = processSchemaNode(value as JsonSchemaObject, definitions);
      } else {
        // Copy other properties as is
        result[key] = value;
      }
    }
  }

  return result;
}

export type JSONSchemaType = JsonSchemaObject | JSONSchemaType[];
// Custom stringify function
export function stringifyCustom(value: JSONSchemaType, indent = '', baseIndent = '  '): string {
  const currentIndent = indent + baseIndent;
  if (value === null) {
    return 'null';
  }
  switch (typeof value) {
    case 'string':
      // Escape single quotes within the string if necessary
      return `'${(value as string).replace(/'/g, "\\\\'")}'`;
    case 'number':
    case 'boolean':
      return String(value);
    case 'object': {
      if (Array.isArray(value)) {
        if (value.length === 0) {
          return '[]';
        }
        const items = value.map(item => `${currentIndent}${stringifyCustom(item, currentIndent, baseIndent)}`);
        return `[\n${items.join(',\n')}\n${indent}]`;
      }
      const keys = Object.keys(value);
      if (keys.length === 0) {
        return '{}';
      }
      const properties = keys.map(key => {
        // Assume keys are valid JS identifiers and don't need quotes
        const formattedKey = key;
        const formattedValue = stringifyCustom(value[key] as JSONSchemaType, currentIndent, baseIndent);
        return `${currentIndent}${formattedKey}: ${formattedValue}`;
      });
      return `{\n${properties.join(',\n')}\n${indent}}`;
    }
    default:
      // Handle undefined, etc.
      return 'undefined';
  }
}
