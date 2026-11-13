import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Gameplay system write-ups (English). Every one follows the same seven questions.
const systems = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/systems" }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    order: z.number(),
    area: z.string(),
    status: z.enum(["verified", "scripted", "in-progress"]),
    statusNote: z.string(),
    classes: z.array(z.string()),
    sources: z.array(z.string()),
  }),
});

// Knowledge base (Chinese). 30-second idea → problem → in this project → flow → code → pitfalls → further reading.
const kb = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/kb" }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    order: z.number(),
    topic: z.string(),
    sources: z.array(z.string()).default([]),
  }),
});

export const collections = { systems, kb };
