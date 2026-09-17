import { z } from "zod";
const widgetSchema = z
  .object({
    title: z.string().optional().catch(undefined),
    description: z.string().optional().catch(undefined),
    html: z.string().optional().catch(undefined),
    color: z.string().optional().catch(undefined),
    count: z.number().int().min(1).max(20).optional().catch(undefined),
    columns: z.number().int().min(1).max(4).optional().catch(undefined),
    min_headings: z.number().int().min(1).max(20).optional().catch(undefined),
    show_image: z.boolean().optional().catch(undefined),
    platforms: z.array(z.string()).optional().catch(undefined),
    content: z
      .array(
        z.object({ title: z.string().optional(), text: z.string().optional() }),
      )
      .optional()
      .catch(undefined),
  })
  .catch({});
export type WidgetConfig = z.infer<typeof widgetSchema>;
export interface WidgetPageContext {
  postId?: string;
  categoryId?: string;
  tags?: string[];
}
export const parseWidgetConfig = (input: unknown): WidgetConfig =>
  widgetSchema.parse(input);
