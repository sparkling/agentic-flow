/**
 * FastMCP registration wrapper for Enhanced Agent Booster tools.
 *
 * Bridges the raw inputSchema/handlers format in enhanced-booster-tools.ts
 * into FastMCP's addTool({ parameters: z.object(), execute }) convention.
 */
import { z } from 'zod';
import {
  enhancedBoosterTools,
  enhancedBoosterHandlers,
} from '../../tools/enhanced-booster-tools.js';

type BoosterHandlerName = keyof typeof enhancedBoosterHandlers;

/**
 * Convert a JSON-Schema properties map to a Zod object schema.
 *
 * Handles the subset of types used by enhanced-booster-tools:
 *   string, number, boolean, array (shallow).
 */
function jsonSchemaToZod(
  properties: Record<string, any>,
  required: string[] = [],
): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, prop] of Object.entries(properties)) {
    let field: z.ZodTypeAny;

    switch (prop.type) {
      case 'number':
        field = z.number();
        break;
      case 'boolean':
        field = z.boolean();
        break;
      case 'array':
        // enhanced_booster_batch uses array of objects — accept any[]
        field = z.array(z.any());
        break;
      case 'string':
      default:
        field = z.string();
        break;
    }

    if (prop.description) {
      field = field.describe(prop.description);
    }

    if (!required.includes(key)) {
      field = field.optional();
    }

    shape[key] = field;
  }

  return z.object(shape);
}

/**
 * Register all Enhanced Agent Booster tools on a FastMCP server instance.
 *
 * 10 tools: enhanced_booster_edit, enhanced_booster_edit_file,
 * enhanced_booster_stats, enhanced_booster_pretrain,
 * enhanced_booster_benchmark, enhanced_booster_record_outcome,
 * enhanced_booster_batch, enhanced_booster_prefetch,
 * enhanced_booster_likely_files
 */
export function registerBoosterTools(server: any): void {
  for (const tool of enhancedBoosterTools) {
    const handler = enhancedBoosterHandlers[tool.name as BoosterHandlerName];
    if (!handler) continue;

    const schema = tool.inputSchema;
    const properties = schema.properties || {};
    const required = schema.required || [];

    server.addTool({
      name: tool.name,
      description: tool.description,
      parameters: jsonSchemaToZod(properties, required),
      execute: async (params: any) => {
        try {
          const result = await handler(params as any);
          // Handlers already return { content: [...] } — extract text for FastMCP
          if (result?.content?.[0]?.text) {
            return result.content[0].text;
          }
          return JSON.stringify(result, null, 2);
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
          }, null, 2);
        }
      },
    });
  }
}
