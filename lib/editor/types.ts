import { z } from "zod";
import type { DiffLine } from "@/lib/editor/diff";
import type { FieldKind, FieldValue } from "@/lib/editor/toml-fields";

// What the form sends and what it gets back. The request is untrusted: the server checks it with
// these schemas, looks every id up in its own catalog and re-reads every file before using it.

const OwnersList = z.array(z.string().max(200)).max(50);

export const EditRequestSchema = z.object({
  files: z
    .array(
      z.object({
        id: z.string().max(300),
        toml: z.array(z.object({ id: z.string().max(300), from: z.unknown(), to: z.unknown() })).max(200).optional(),
        owners: z
          .array(
            z.discriminatedUnion("op", [
              z.object({ op: z.literal("set"), pattern: z.string().max(500), from: OwnersList, to: OwnersList }),
              z.object({ op: z.literal("add"), pattern: z.string().max(500), to: OwnersList }),
              z.object({ op: z.literal("remove"), pattern: z.string().max(500), from: OwnersList }),
            ]),
          )
          .max(200)
          .optional(),
      }),
    )
    .max(60),
  properties: z
    .array(z.object({ repo: z.string().max(100), name: z.string().max(75), from: z.string().max(200).nullable(), to: z.string().max(200).nullable() }))
    .max(500),
});

export type EditRequest = z.infer<typeof EditRequestSchema>;

/** A TOML value as the form shows it. */
export type FieldView = {
  id: string;
  key: string;
  section: string;
  line: number;
  kind?: FieldKind;
  value?: FieldValue;
  /** The value as text, for a read-only field. */
  display: string;
  note?: string;
  help?: string[];
  /** Why this value is shown read-only even though the file is edited here. */
  locked?: string;
  /** The value must be a 40-character commit id. */
  commitId?: true;
};

export type RuleView = { pattern: string; owners: string[]; help?: string[]; line: number };

export type FileView = {
  id: string;
  group: string;
  repo: string;
  path: string;
  title: string;
  effect: string;
  url: string;
  format: "toml" | "codeowners" | "commit";
  readOnly?: string;
  /** When the editor read it (absent for a file it does not read). */
  fetchedAt?: string;
} & (
  | { ok: true; exists: boolean; fields?: FieldView[]; rules?: RuleView[]; reason?: undefined }
  | { ok: false; reason: string }
);

export type PropertyDefView = { name: string; type: string; required: boolean; allowed: string[]; description: string; editableBy: string };

export type PropertiesView =
  | { ok: true; defs: PropertyDefView[]; repos: { repo: string; values: Record<string, string | string[] | null> }[]; cut: boolean; sourceUrl: string; fetchedAt: string }
  | { ok: false; reason: string };

export type PlannedFileView = { id: string; path: string; title: string; created: boolean; summary: string[]; diff: DiffLine[]; effect: string };

export type PlanView =
  | {
      ok: true;
      digest: string;
      prs: { repo: string; title: string; files: PlannedFileView[]; reviewNote: string }[];
      properties: { repo: string; name: string; from: string | null; to: string | null; needsOrgOwner: boolean }[];
      script: string;
    }
  | { ok: false; reason: string };

export type ApplyStep = { what: string; ok: boolean; url?: string; detail?: string };

export type ApplyView = { ok: boolean; login?: string; reason?: string; steps: ApplyStep[] };
