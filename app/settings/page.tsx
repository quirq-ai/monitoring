import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { SettingsEditor } from "@/components/settings/editor";
import { GROUPS } from "@/config/settings";
import { editorMode } from "@/lib/editor/mode";
import type { FileView, PropertiesView } from "@/lib/editor/types";
import { ownersView, tomlView } from "@/lib/editor/view";
import { blobUrl, ORG } from "@/lib/fetch";
import { readProperties, readSettingsFile, settingsCatalog } from "@/lib/sources/settings";

export const metadata: Metadata = { title: "Settings · quirq monitoring" };

// Rendered per request: on a person's own machine it reads main live through their gh login.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const mode = editorMode();
  const [catalog, properties] = await Promise.all([settingsCatalog(), readProperties()]);
  const files: FileView[] = await Promise.all(
    catalog.files.map(async (file) => {
      const base = { id: file.id, group: file.group, repo: file.repo, path: file.path, title: file.title, effect: file.effect, url: blobUrl(file.repo, file.branch, file.path), format: file.format, readOnly: file.readOnly };
      const read = await readSettingsFile(file);
      if (!read.ok) return { ...base, ok: false as const, reason: read.reason };
      if (file.format === "codeowners") return { ...base, ok: true as const, exists: read.value.exists, rules: ownersView(read.value.text) };
      const view = tomlView(read.value.text, Boolean(file.readOnly));
      if (!view.ok) return { ...base, ok: false as const, reason: `${file.path}: ${view.reason}` };
      return { ...base, ok: true as const, exists: true, fields: view.fields };
    }),
  );
  const propertiesView: PropertiesView = properties.ok ? { ok: true, ...properties.value } : { ok: false, reason: properties.reason };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <PageTitle
        title="Settings"
        lead={`Edit the gates, policies, owners and repo properties set up across ${ORG}. Every file edit becomes a pull request on the repo that owns it.`}
      />
      <SettingsEditor mode={mode} groups={GROUPS} files={files} properties={propertiesView} catalogReason={catalog.reason} />
    </div>
  );
}
